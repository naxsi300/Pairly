# Pairly backup strategy

## Goal

Recover from data loss (disk failure, accidental delete, botched migration,
corruption) within a small RPO (≤1h) and a small RTO (≤30min). Tested before
prod, not after.

## What is backed up

The Pairly database only. This is the single source of truth: pairs, users,
wishlist, gifts, countdowns, mood, bucket list, QOTD answers. Everything else
(code, Caddyfile, env template, Mini App) lives in git and is recoverable from
the repo.

**Not backed up:** bot tokens and S3 credentials (these are secrets in
`/etc/pairly/pairly.env`; rotate/re-enter manually after a rebuild — never store
secrets in the DB dump).

## How

`deploy/scripts/backup.sh`, run hourly by `/etc/cron.d/pairly-backup`.

- **SQLite (dev + small prod):** `sqlite3 <db> ".backup '<file>'"` — an
  *online, consistent* snapshot safe to take while the bot is writing. The
  `.backup` command uses SQLite's backup API, which handles concurrent writers
  correctly (unlike a raw file copy of a WAL db).
- **Postgres (prod):** `pg_dump --format=custom --clean --if-exists --no-owner`
  against the URL from `PAIRLY_DATABASE_URL` (with the `+asyncpg` driver
  stripped so libpq understands it).

The script detects the engine from the `DATABASE_URL` scheme and dispatches;
it's DB-agnostic. Switching prod from SQLite to Postgres requires **no** backup
script change.

The dump is uploaded to S3-compatible storage via `aws s3` (aws-cli v2), so this
works against AWS S3, Selectel, Backblaze B2, MinIO, Cloudflare R2, etc. — any
S3-API endpoint.

## Retention math

Hourly backups, promoted by tier. Objectives:

| Tier | Keep | Count | Window |
|---|---|---|---|
| Hourly | newest within 24h | up to 24 | last 24h |
| Daily | newest of each day | 7 | last 7 days |
| Weekly | newest of each ISO week | 4 | last 4 weeks |

So at steady state: ~24 hourly + 7 daily + 4 weekly = **~35 objects max**. For a
tiny Pairly DB each dump is kilobytes-to-low-megabytes; total storage is trivial
well under any provider's free tier.

The retention pass runs at the end of every backup and deletes objects that fall
outside all three keep rules. It's keyed off the ISO8601 timestamp embedded in
each object's name (not S3 mtime), so it's deterministic across clock skew.

## Storage size estimate

Assume the DB grows to ~10 MB after a year of a busy pair (generous; the schema
is small). A custom-format pg_dump / SQLite `.backup` compresses text-heavy data
roughly 3-5x, so ~2-4 MB per dump. 35 objects × 4 MB ≈ **140 MB** peak. Any S3
bucket handles this in the free tier.

## Configuring S3 credentials

Create an S3-compatible bucket and a key/secret with read+write+delete+list on
that bucket only. Put the following in `/etc/pairly/pairly.env` (chmod 600,
owner `pairly`):

```bash
AWS_ACCESS_KEY_ID=AKIAEXAMPLE
AWS_SECRET_ACCESS_KEY=secret
AWS_ENDPOINT_URL_S3=https://s3.ru-1.storage.selcloud.ru   # omit for AWS S3 itself
AWS_REGION=ru-1                                            # bucket region
PAIRLY_BACKUP_BUCKET=pairly-backups
PAIRLY_BACKUP_PREFIX=pairly                                # optional, default pairly
```

`backup.sh` sources `/etc/pairly/pairly.env` automatically when run from cron,
so no extra env plumbing is needed.

**Bucket policy:** grant the key **read+write+delete+list** on
`s3://<bucket>/<prefix>/*` only. Deny everything else. This key cannot read
other buckets or enumerate the account.

## Restore procedure

`deploy/scripts/restore.sh` — interactive picker over the most recent 15
snapshots, with a confirmation prompt and an automatic pre-restore copy of the
current DB.

```bash
sudo systemctl stop pairly-bot pairly-api
sudo /usr/local/sbin/pairly-restore.sh
# (or non-interactive:  sudo pairly-restore.sh --latest)
sudo systemctl start pairly-api pairly-bot
```

For SQLite, the script saves the current db as
`<db>.pre-restore.<timestamp>` before overwriting, so a botched restore is
reversible. For Postgres it runs `pg_restore --clean --if-exists` (drops
existing objects before recreating).

## Restore test procedure (REQUIRED before prod)

A backup you have never restored is unproven. Run this drill in staging before
trusting prod:

1. Take a fresh backup: `sudo /usr/local/sbin/pairly-backup.sh`. Note the
   reported key.
2. Spin up a throwaway DB (separate file or Postgres DB name) and point a test
   `PAIRLY_DATABASE_URL` at it.
3. Run the restore against that target:
   ```bash
   PAIRLY_DATABASE_URL='sqlite+aiosqlite:////tmp/restore-test.db' \
   PAIRLY_LOCAL_DIR=/tmp/restore-test \
   sudo -E /usr/local/sbin/pairly-restore.sh --latest
   ```
4. Verify counts/row spot-checks:
   ```bash
   sqlite3 /tmp/restore-test.db "SELECT COUNT(*) FROM pairs;"
   sqlite3 /tmp/restore-test.db "SELECT COUNT(*) FROM wishlist_items;"
   ```
5. If Postgres, repeat the drill against a throwaway DB:
   ```bash
   PAIRLY_DATABASE_URL='postgresql+asyncpg://pairly:secret@localhost/pairly_restore_test'
   sudo -E /usr/local/sbin/pairly-restore.sh --latest
   ```
6. Clean up: drop the test DB / delete the test file.

Record the drill date + result in this doc (append below) each time. Re-run at
least once per quarter and after any schema migration.

### Drill log

| Date | By | Engine | Result |
|---|---|---|---|
| _(add rows here)_ | | | |

## Failure modes + alerts

- `backup.sh` logs to `/var/log/pairly/backup.log` and exits non-zero on any
  failure. Configure cron mail (or a log shipper) so a failed run surfaces.
- The retention pass failing does **not** fail the whole run — backups are
  always uploaded first. A stuck retention pass just means more objects pile up;
  check the log and re-run manually.
- If the DB is unreachable, the script exits non-zero before touching S3, so you
  won't get an empty/corrupt dump uploaded as a "backup."
