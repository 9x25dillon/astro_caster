// Client error telemetry (task-schedule R6): uncaught errors and unhandled
// rejections ride the existing fire-and-forget feature-event rail, so phone-
// only breakage shows up in the Observatory Stats panel instead of vanishing.
//
// Same privacy posture as the rest of telemetry: local-first SQLite, a
// per-tab random session id, and trimmed payloads — an error message and a
// source location, never a full stack, never form contents or birth data.
import { trackEvent } from "../api/client";

const MAX_EVENTS_PER_SESSION = 10;
const MAX_MESSAGE_CHARS = 200;

let sent = 0;
const seen = new Set<string>();

function report(kind: "error" | "unhandledrejection", message: string, source?: string) {
  const msg = message.slice(0, MAX_MESSAGE_CHARS);
  const key = `${kind}|${msg}`;
  // One event per distinct error per session; hard cap against error loops.
  if (seen.has(key) || sent >= MAX_EVENTS_PER_SESSION) return;
  seen.add(key);
  sent += 1;
  trackEvent("client_error", { kind, message: msg, source: source ?? null });
}

/** Register window-level handlers. Call once, before the app renders, so
 *  boot-time failures are caught too. */
export function installErrorTelemetry(): void {
  window.addEventListener("error", (e) => {
    // e.filename is a URL — keep only the file part, drop query/hash noise.
    const file = e.filename ? e.filename.split("/").pop()?.split("?")[0] : undefined;
    const source = file ? `${file}:${e.lineno ?? 0}:${e.colno ?? 0}` : undefined;
    report("error", e.message || "unknown error", source);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const message =
      r instanceof Error ? `${r.name}: ${r.message}` : String(r ?? "unknown rejection");
    report("unhandledrejection", message);
  });
}
