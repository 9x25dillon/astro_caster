# Deploying Astra with Docker

Two stacks are provided:

| File | Frontend | Use |
|------|----------|-----|
| `docker-compose.yml` | built bundle served by **nginx** | production-style / demo |
| `docker-compose.dev.yml` | **Vite dev server** on node:20 (hot-reload) | local development |

Both build the **backend** from `backend/Dockerfile` (FastAPI · Python 3.12) and
persist its SQLite data (`telemetry.db`, `receipts.db`) in the `backend-data`
volume. The dev stack additionally sidesteps the "host Node 18 is too old for
Vite 8" problem by running Node 20 inside a container.

Prerequisites: Docker Engine + Compose v2 (`docker compose version`).

---

## 1. Configure

```bash
cp .env.example .env
```

Everything in `.env` is optional — with nothing set, the app runs fully and the
AI layer falls back to the on-device offline reflection. Compose reads `.env`
automatically. Key variables:

| Variable | Meaning | Default |
|----------|---------|---------|
| `WEB_PORT` | host port for the web app — same in dev & prod | `5173` |
| `AAE_ENV` | `development` (boots without a secret) or `production` | `development` |
| `AAE_SECRET` | HMAC secret — **required in production** | empty |
| `AAE_AI_PROVIDER` | `auto` / `ollama` / `openai` / `kgirl` | `auto` |
| `OLLAMA_HOST` | Ollama endpoint the backend calls | `http://host.docker.internal:11434` |
| `AAE_OLLAMA_MODEL` | quick model | `qwen2.5:3b` |
| `AAE_AI_API_KEY` | cloud key (OpenAI-compatible gateway) | empty |
| `ELEVENLABS_API_KEY` | premium voice | empty |
| `SE_EPHE_PATH` | Swiss Ephemeris `.se1` files path | empty (Moshier) |

### Ollama

`OLLAMA_HOST` is the single knob for local models. The backend runs in a
container, so `localhost` there is the container, not your machine — the default
`http://host.docker.internal:11434` reaches an Ollama running on the host (both
compose files map `host.docker.internal` via `extra_hosts`). Alternatives:

- Ollama as its own container/service → `OLLAMA_HOST=http://ollama:11434`.
- Remote Ollama box → `OLLAMA_HOST=http://10.0.0.5:11434`.

`OLLAMA_HOST` is wired to what the code reads (`AAE_OLLAMA_URL`) inside compose,
so you only ever set `OLLAMA_HOST`.

---

## 2. Development (hot-reload)

```bash
docker compose -f docker-compose.dev.yml up --build
```

- App → **http://localhost:${WEB_PORT:-5173}**
- API docs (Swagger) → **http://localhost:8787/docs**

`./backend` and `./frontend` are bind-mounted, so source edits reload live
(uvicorn `--reload`, Vite HMR). `node_modules` lives in a named volume, so the
host's Node-18-built modules never shadow the container's. First `up` installs
deps (slower); later starts are fast.

Stop: `Ctrl-C`, then `docker compose -f docker-compose.dev.yml down`.

---

## 3. Production-style (nginx)

```bash
docker compose up --build          # add -d to detach
```

- App → **http://localhost:${WEB_PORT:-5173}** (same port as dev)
- `/api/*` is reverse-proxied by nginx to the backend (SSE streaming for
  `/api/ai-ask-stream` is unbuffered); the backend port is **not** published.

The frontend image is a multi-stage build (`node:20` builds the PWA →
`nginx:alpine` serves `dist`). It waits for the backend's healthcheck before
starting so the `/api` upstream is always resolvable.

### Hardening for real production

```dotenv
AAE_ENV=production
AAE_SECRET=<openssl rand -hex 32>
```

With `AAE_ENV=production` the backend **fails closed**: it refuses to boot
without a strong `AAE_SECRET` (and, if `AAE_SIGN_ALGO=ed25519`, without a valid
`AAE_ED25519_SEED`). Also review, in `backend/main.py` / the app's env:

- `AAE_CORS` — set an explicit origin instead of the `*` dev default.
- `AAE_ETH_RPC` / `AAE_*_MIN_WEI` — enable real on-chain entitlement checks.
- Terminate TLS in front (the app already emits HSTS/CSP headers).

---

## 4. Operate

```bash
docker compose ps                 # status + health
docker compose logs -f backend    # follow backend logs
docker compose down               # stop (keeps the data volume)
docker compose down -v            # stop AND delete backend-data (telemetry/receipts)
```

Backend data persists in the `backend-data` volume across `up`/`down`. Rebuild
after dependency changes with `--build`.

---

## 5. Troubleshooting

- **Frontend build fails resolving `@astra/core`** — the frontend image builds
  from the **repo root** (`context: .`, `dockerfile: frontend/Dockerfile`)
  because the build needs `../packages`. Run compose from the repo root.
- **AI always "offline"** — expected with no provider configured. Set
  `OLLAMA_HOST` (and pull a model: `ollama pull qwen2.5:3b`) or `AAE_AI_API_KEY`.
- **Ollama unreachable from the container** — confirm Ollama listens on all
  interfaces (`OLLAMA_HOST=0.0.0.0 ollama serve`) so `host.docker.internal` can
  reach it; on native Linux the `extra_hosts` gateway mapping is what resolves it.
- **Backend exits immediately in production** — that is the fail-closed guard:
  set `AAE_SECRET` (and keep `AAE_ENV=production`).
- **Port already in use** — change `WEB_PORT` (applies to both dev and prod) or
  the backend `8787:8787` mapping (dev).

---

## 6. Secret rotation runbook (Phase 2.3)

Rotate on schedule (quarterly), on any suspected exposure, and always **before
first public deploy**.

| Secret | Rotate with | Blast radius |
|---|---|---|
| `AAE_SECRET` | `openssl rand -hex 32` → `backend/.env` → restart | Every outstanding HMAC entitlement token dies. Personal mode and `AAE_DEV_TOKEN` survive (separate paths); paying users need re-minted tokens — rotate at a maintenance window and re-issue from the receipts ledger. |
| `AAE_DEV_TOKEN` | `openssl rand -hex 24` → `backend/.env` → restart | Only your own unlock link (`tools/unlock.py` prints the new one). Never set in production — the boot guard refuses it. |
| `AAE_ED25519_SEED` | `tools/gen_ed25519_key.py` | Ed25519-signed tokens die; clients embedding the public key need the new one. |
| `AAE_ANTHROPIC_API_KEY` | Anthropic console → revoke old, issue new → `dev.py ai set` → `ai check` | None (server-side only). |
| `AAE_OPENAI_API_KEY` | OpenAI dashboard → revoke old, issue new → `.env` → restart | None (server-side only). |
| `ELEVENLABS_API_KEY` | ElevenLabs dashboard → `.env` → restart | None. |

After any rotation: restart the backend (env is read at boot), run
`tools/dev.py smoke` against it, and verify the old value is dead (a request
bearing it must fail). Secrets live **only** in `backend/.env` (gitignored)
or the host's secret store — never in images, compose files, or the repo.

**Drill log:** 2026-07-20 — `AAE_SECRET` + `AAE_DEV_TOKEN` rotated per this
runbook; old dev token verified dead (`/api/admin/stats` → 403), new token
live (200), smoke 24/24 green. API keys (Anthropic/OpenAI/ElevenLabs) rotate
at their consoles as part of the pre-deploy sweep.

---

## 7. Backups & restore drill (Phase 3.5)

All server-side state lives in two places (the browser side is covered by the
Library's Vault export):

- `backend/data/*.db` — the receipts ledger + telemetry counters
- `backend/.env` — the secrets

`backend/tools/backup.py` gathers both into one tar.gz and encrypts it
(Fernet: AES-128-CBC + HMAC-SHA256; key derived from a passphrase via scrypt
with a random per-file salt). The output is safe to copy off-box — a
truncated or tampered file fails the HMAC on restore instead of restoring
garbage. Keep the passphrase in the host's secret store as
`AAE_BACKUP_PASSPHRASE`, **never** in the repo or the backup itself; losing it
means losing the backups.

```bash
# create — writes backups/aae-backup-<utc-timestamp>.enc
AAE_BACKUP_PASSPHRASE=… backend/.venv/bin/python backend/tools/backup.py create --out backups/

# restore — decrypts into a directory (inspect before overwriting live state)
AAE_BACKUP_PASSPHRASE=… backend/.venv/bin/python backend/tools/backup.py restore backups/aae-backup-<ts>.enc --into /tmp/restore

# drill — in-memory round-trip self-check, touches nothing
AAE_BACKUP_PASSPHRASE=… backend/.venv/bin/python backend/tools/backup.py drill
```

`backups/` and `*.enc` are gitignored. Schedule `create` with a **systemd
timer** (or cron) on the host and push the resulting file to encrypted
off-box storage:

```ini
# /etc/systemd/system/aae-backup.service   (Type=oneshot)
[Service]
Type=oneshot
Environment=AAE_BACKUP_PASSPHRASE=…            # or EnvironmentFile= a 600 file
WorkingDirectory=/opt/astra
ExecStart=/opt/astra/backend/.venv/bin/python backend/tools/backup.py create --out /var/backups/astra
ExecStartPost=/usr/local/bin/ship-offbox.sh   # rclone/rsync to remote

# /etc/systemd/system/aae-backup.timer
[Timer]
OnCalendar=daily
Persistent=true
[Install]
WantedBy=timers.target
```

**Restore drill log:** 2026-07-20 — performed against live state (receipts.db,
telemetry.db, .env). `create` → `restore` into a temp dir → both DBs opened
as valid SQLite (`pragma integrity_check` = `ok`; 1 and 5 tables), `.env`
byte-identical, and a wrong passphrase correctly rejected on restore
(`ValueError: decryption failed`). The `drill` subcommand (in-memory
round-trip + wrong-passphrase check) is wired into CI via
`tests/test_backup.py`. Re-run the on-host drill after the first staging
deploy against real production volumes.
