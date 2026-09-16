#!/usr/bin/env bash
# Retry the payment on the observatory's subscription(s) — session 42.
#
# Run ON THE BOX, where the live key lives:
#   scp -i ~/.ssh/astra_hetzner ops/stripe_retry_subscription.sh astra@178.104.120.219:/tmp/
#   ssh -i ~/.ssh/astra_hetzner astra@178.104.120.219 'bash /tmp/stripe_retry_subscription.sh'
#
# Or dry-run first (default): lists every subscription and its latest invoice,
# pays nothing. Add `--pay` to retry each OPEN invoice on a past_due/unpaid
# subscription. Stripe charges the customer's default payment method; a card
# that still declines leaves the invoice open and prints the decline reason.
#
# Reads AAE_STRIPE_SECRET_KEY from ~/astro-aae/.env. Talks to Stripe with curl
# only (no CLI on the box). Never touches the ledger or the containers: a
# successful retry makes Stripe emit invoice.paid, and the subscription's
# existing key keeps verifying — the entitlement was never revoked by a
# past_due, only by customer.subscription.deleted.
set -euo pipefail
ENV_FILE="${ENV_FILE:-$HOME/astro-aae/.env}"
KEY=$(grep -E '^AAE_STRIPE_SECRET_KEY=' "$ENV_FILE" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -n "$KEY" ] || { echo "no AAE_STRIPE_SECRET_KEY in $ENV_FILE" >&2; exit 2; }
PAY=0; [ "${1:-}" = "--pay" ] && PAY=1
S="https://api.stripe.com/v1"
api() { curl -sS -u "$KEY:" "$@"; }

echo "mode: $([ $PAY = 1 ] && echo PAY || echo dry-run)   key: ${KEY:0:8}…"
subs=$(api "$S/subscriptions?status=all&limit=20&expand[]=data.latest_invoice")
echo "$subs" | python3 -c '
import json,sys,datetime
d=json.load(sys.stdin)
if "error" in d: print("stripe error:", d["error"].get("message")); sys.exit(1)
rows=d.get("data",[])
print(len(rows), "subscription(s)")
for s in rows:
    inv=s.get("latest_invoice") or {}
    sid=s.get("id"); st=s.get("status"); cust=s.get("customer")
    # 2025+ API versions moved current_period_end onto the subscription ITEM.
    it=((s.get("items") or {}).get("data") or [{}])[0]
    ts=s.get("current_period_end") or it.get("current_period_end") or 0
    end=datetime.datetime.fromtimestamp(ts, datetime.timezone.utc).date()
    print("  %s  status=%-10s customer=%s  period_end=%s" % (sid, st, cust, end))
    if isinstance(inv,dict) and inv:
        print("      latest invoice %s  status=%s  due=%s paid=%s  attempts=%s  next_attempt=%s" % (
            inv.get("id"), inv.get("status"), inv.get("amount_due"), inv.get("amount_paid"),
            inv.get("attempt_count"), inv.get("next_payment_attempt")))
'
[ $PAY = 1 ] || { echo "(dry-run: add --pay to retry open invoices on past_due/unpaid subscriptions)"; exit 0; }

for sid in $(echo "$subs" | python3 -c 'import json,sys; [print(s["id"]) for s in json.load(sys.stdin).get("data",[]) if s["status"] in ("past_due","unpaid")]'); do
  echo "retrying $sid"
  for inv in $(api "$S/invoices?subscription=$sid&status=open&limit=5" | python3 -c 'import json,sys; [print(i["id"]) for i in json.load(sys.stdin).get("data",[])]'); do
    echo "  paying $inv"
    api -X POST "$S/invoices/$inv/pay" | python3 -c '
import json,sys; r=json.load(sys.stdin)
e=r.get("error")
if e: print("    FAILED:", e.get("message"), "|", e.get("decline_code",""))
else: print("    ->", r.get("status"), "paid", r.get("amount_paid"))'
  done
done
echo "re-check: bash $0   (no --pay) — a paid invoice moves the subscription back to active"
