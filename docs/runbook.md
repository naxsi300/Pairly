# Pairly runbook

Operational playbook for the Pairly backend (bot + Mini App API). For backup
detail see [backup.md](backup.md). For architecture see `docs/adr/`.

## Service map

| What | Unit | Binary | Port |
|---|---|---|---|
| Telegram bot (aiogram polling) | `pairly-bot.service` | `python -m pairly.main` | — (outbound) |
| Mini App API (FastAPI/uvicorn) | `pairly-api.service` | `uvicorn pairly.api.app:app` | `127.0.0.1:8000` |
| TLS + reverse proxy + static | `caddy.service` | caddy | `:80`, `:443` |
| Hourly DB backup | `/etc/cron.d/pairly-backup` | `/usr/local/sbin/pairly-backup.sh` | — |

Logs: `journalctl -u pairly-bot -f`, `journalctl -u pairly-api -f`. Backup log:
`/var/log/pairly/backup.log`.

Secrets + DB URL: `/etc/pairly/pairly.env` (chmod 600, owner `pairly`). App
source: `/opt/pairly`. SQLite db (dev): `/var/lib/pairly/pairly.db`.

## Golden rules

1. **Never edit data directly while services are up** unless you've stopped
   `pairly-bot` + `pairly-api`. SQLite WAL + concurrent writes = corruption risk.
2. **Every change to a DB row is pair-scoped** (`pair_id`). Manual fixes must
   respect this — see "Promote a pair to Pro" below.
3. **Backups are useless until restored.** Test a restore in staging before
   trusting prod (see backup.md).

---

## Incidents

### Bot not responding

Symptoms: `/start` gets no reply; no errors in chat.

1. `systemctl status pairly-bot` — is it `active`?
2. `journalctl -u pairly-bot -n 100 --no-pager` — look for:
   - `Unauthorized` / `401` → bad `PAIRLY_BOT_TOKEN` (rotate it, see below).
   - `Conflict: terminated by other getUpdates` → **another process is polling
     with the same token** (a dev laptop, a second VPS, a duplicate unit).
     Kill the duplicate; only one poller per token.
   - `init_db` / `OperationalError` → DB issue, see "DB locked".
3. `curl -fsS "https://api.telegram.org/bot${TOKEN}/getMe"` — if that 401s, the
   token is wrong/revoked.
4. Restart: `systemctl restart pairly-bot`.

### API returns 5xx

1. `systemctl status pairly-api`.
2. `journalctl -u pairly-api -n 100` — common causes:
   - `OperationalError: database is locked` → SQLite contention (below).
   - `Address already in use` → something else on `127.0.0.1:8000`.
3. From the VPS: `curl -fsS http://127.0.0.1:8000/api/health` (bypasses Caddy).
4. Through Caddy: `curl -fsS https://<domain>/api/health`.
5. Caddy 502 → uvicorn is down or not on 8000. Caddy logs:
   `journalctl -u caddy -f`.

### DB locked (SQLite)

`database is locked` means a write waited longer than the busy timeout.

**Quick fix:**
1. `systemctl stop pairly-bot pairly-api`.
2. `sqlite3 /var/lib/pairly/pairly.db "PRAGMA wal_checkpoint(TRUNCATE);"`
3. `systemctl start pairly-api pairly-bot`.

**Prevention:**
- WAL mode is required for concurrent read+write. Confirm:
  `sqlite3 /var/lib/pairly/pairly.db "PRAGMA journal_mode;"` → should be `wal`.
- The app sets a busy timeout; if locks persist, the write load has outgrown
  SQLite — migrate to Postgres by flipping `PAIRLY_DATABASE_URL` and re-running
  `alembic upgrade head`. See `docs/open-decisions.md` #9.

**Do NOT** copy the db file while services are writing. Use `sqlite3 .backup`
(the backup script already does this) or stop services first.

### Disk full

1. `df -h` — which FS is full? Usually `/` (logs, db) or `/var/backups`.
2. Big offenders, in order:
   - `journalctl --disk-usage` → `journalctl --vacuum-size=200M`.
   - `/var/log/pairly/backup.log` → `truncate -s 0 /var/log/pairly/backup.log`.
   - `/var/backups/pairly/*.dump` → safe to delete (they're already in S3).
   - `/var/lib/pairly/pairly.db-wal` → checkpoint it (see DB locked).
3. After freeing space, confirm services recovered: `systemctl status pairly-bot pairly-api`.
4. If SQLite hit ENOSPC mid-write, it may have rolled back safely, but verify the
   `.db` opens: `sqlite3 /var/lib/pairly/pairly.db "PRAGMA integrity_check;"`.
   If that fails, restore from the latest backup (below).

### Restore from backup

See [backup.md](backup.md#restore-procedure) for the full procedure. Summary:

```bash
sudo systemctl stop pairly-bot pairly-api
sudo /usr/local/sbin/pairly-restore.sh        # interactive picker
sudo systemctl start pairly-api pairly-bot
```

Always test a restore in staging first; a backup you've never restored is
unproven.

---

## Procedures

### Rotate the bot token

1. Talk to `@BotFather` → `/revoke` → `/token` (or `/settoken`) → copy new token.
2. `sudo systemctl edit --full pairly-bot` is NOT needed; edit the env file:
   ```bash
   sudo nano /etc/pairly/pairly.env   # update PAIRLY_BOT_TOKEN=...
   ```
3. `sudo systemctl restart pairly-bot`.
4. Verify: DM the bot `/start`. Check `journalctl -u pairly-bot -n 20`.
5. The old token is dead instantly. Any other process still using it will get
   `Unauthorized` — find and update those too (see "Bot not responding").

### Promote a pair to Pro (manual SQL)

Until a payment gateway is wired (see `docs/open-decisions.md` #13), Pro is a
manual DB action. **Stop services first** to avoid concurrent-write corruption:

```bash
sudo systemctl stop pairly-bot pairly-api
sudo sqlite3 /var/lib/pairly/pairly.db
```

Find the pair (replace the Telegram IDs with the two members'):
```sql
SELECT id, tier, created_at FROM pairs p
WHERE EXISTS (SELECT 1 FROM users u WHERE u.pair_id = p.id AND u.tg_id IN (111111111, 222222222));
```

Promote:
```sql
UPDATE pairs SET tier = 'pro' WHERE id = '<pair_id>';
-- sanity check
SELECT id, tier FROM pairs WHERE id = '<pair_id>';
.quit
```

```bash
sudo systemctl start pairly-api pairly-bot
```

For Postgres, same SQL via `psql "$PAIRLY_DATABASE_URL"` (services can stay up;
Postgres handles concurrent writes).

### Restart / rollback a deploy

Pairly is stateless across processes; a deploy = `git pull && uv sync && alembic
upgrade head && systemctl restart pairly-bot pairly-api`. The idempotent
`install.sh` does all of this.

To **roll back** to a prior commit:
```bash
cd /opt/pairly
sudo git fetch --all
sudo git reset --hard <previous-sha>
sudo uv sync
sudo uv run alembic -c backend/pairly/migrations/alembic.ini downgrade -1   # if a migration needs reverting
sudo systemctl restart pairly-bot pairly-api
```

Downgrading migrations is only needed if the new code shipped a migration the
old code can't tolerate. When in doubt, leave the schema and roll forward a fix.

### Mini App deploy

The Mini App is static (built `miniapp/dist`). To publish:

```bash
cd /opt/pairly/miniapp
npm ci
npm run build
sudo rsync -a --delete dist/ /var/www/pairly/
```

Caddy serves `/var/www/pairly`; no reload needed for static file changes.
