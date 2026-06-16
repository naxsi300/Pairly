# Deploying Pairly via Docker Compose (production)

This is the recommended deploy path for a self-hostable VPS (Hetzner/Reg.ru,
4–8 EUR/mo). It terminates TLS automatically via Caddy + Let's Encrypt and runs
the bot in webhook mode.

## Topology

```
Internet ── TLS ── Caddy (:80, :443)
                  ├─ /api/*           → api:8000  (FastAPI / pair-scoping / initData HMAC)
                  ├─ /telegram-webhook → bot:8080 (aiogram, webhook)
                  └─ /*               → static Mini App (miniapp/dist)
```

Single `pairly` image; three roles via `CMD`:

| Service | CMD     | Port  | Notes                              |
|---------|---------|-------|------------------------------------|
| init    | `init`  | —     | runs migrations + seed, then exits  |
| api     | `api`   | 8000  | FastAPI / uvicorn                  |
| bot     | `bot`   | 8080  | aiogram in webhook mode            |

Plus the official `caddy:2-alpine` image.

## 1 — DNS

Point an A record for the domain you want to use (e.g. `app.example.com`) at
the VPS IP. Caddy needs the record live *before* it can issue the cert.

## 2 — Provision the VPS

```bash
# On the VPS, as root:
apt update && apt install -y docker.io docker-compose-plugin curl git
systemctl enable --now docker
```

That's it. No Python/uv/systemd needed — everything runs in containers.

## 3 — Clone and configure

```bash
git clone https://github.com/your-fork/pairly.git /opt/pairly
cd /opt/pairly

cp .env.prod.example .env.prod
# Edit .env.prod:
#   PAIRLY_BOT_TOKEN         — from @BotFather
#   PAIRLY_PUBLIC_DOMAIN     — your domain (used by Caddy for Let's Encrypt)
#   PAIRLY_WEBHOOK_URL       — https://<PAIRLY_PUBLIC_DOMAIN>  (Caddy routes /telegram-webhook)
#   PAIRLY_DATABASE_URL      — leave as sqlite+aiosqlite:////data/pairly.db for default
#   PAIRLY_DEV_AUTH          — MUST be false in production
```

## 4 — Build the Mini App

```bash
cd miniapp
npm ci
npm run build      # produces dist/
cd ..
```

`miniapp/dist/` is bind-mounted into the Caddy container as `/srv/miniapp` (read-only).

## 5 — Build and start the stack

```bash
docker compose --env-file .env.prod build
docker compose --env-file .env.prod up -d
docker compose --env-file .env.prod logs -f
```

The `init` service runs first and runs `alembic upgrade head` + `pairly.db.seed`
against the shared `pairly-data` volume. `api` and `bot` wait for it to succeed.

## 6 — Register the Telegram webhook

Caddy routes `/telegram-webhook` to `bot:8080`. The bot auto-registers its
webhook on startup (uses `PAIRLY_WEBHOOK_URL` + `PAIRLY_WEBHOOK_PATH` from the env).

Verify from your laptop:

```bash
curl -s https://your-domain.example.com/api/health
# {"status":"ok"}
```

Send `/start` to your bot on Telegram. If everything is wired correctly, the bot
replies.

## 7 — Backups

The SQLite DB lives on the `pairly-data` Docker volume. Run `deploy/scripts/backup.sh`
on the host (it mounts the same volume) or schedule it inside a cron container.
See `docs/backup.md`.

## Updates

```bash
cd /opt/pairly
git pull
cd miniapp && npm ci && npm run build && cd ..
docker compose --env-file .env.prod build
docker compose --env-file .env.prod up -d
```

## Rollback

```bash
docker compose --env-file .env.prod down
# Restore DB from the latest backup (docs/backup.md):
PAIRLY_DATABASE_URL=sqlite+aiosqlite:///./restored.db bash deploy/scripts/restore.sh --latest
# Replace the volume:
docker compose --env-file .env.prod run --rm -e PAIRLY_DATABASE_URL=sqlite+aiosqlite:////data/pairly.db \
    api python -c "import shutil; shutil.copy('/tmp/restored.db','/data/pairly.db')"
docker compose --env-file .env.prod up -d
```

## Alternative: native systemd

If you'd rather not run Docker on the VPS, the legacy path is documented in
`deploy/scripts/install.sh` + `deploy/systemd/*.service` + `deploy/caddy/Caddyfile`.
Same env vars, just different packaging.
