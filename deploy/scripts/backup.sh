#!/usr/bin/env bash
# Pairly hourly DB backup.
#
# - Detects the DB engine from PAIRLY_DATABASE_URL (scheme):
#     sqlite*   -> `sqlite3 .backup` (online, consistent snapshot)
#     postgres* -> `pg_dump` (custom format)
# - Uploads the dump to S3-compatible storage via `aws s3` (aws-cli v2).
# - Retention: keep hourly within 24h; promote 1/day -> 7 daily; 1/week -> 4 weekly.
# - Idempotent + safe to re-run within the same hour (overwrites the same hourly key).
# - Logs to $LOG_FILE and exits non-zero on failure so cron mail catches it.
#
# Cron example (hourly, at minute 7):
#   7 * * * * /opt/pairly/deploy/scripts/backup.sh
# (env loaded from /etc/pairly/pairly.env inside the script if present)
#
# Required env (via /etc/pairly/pairly.env or the environment):
#   PAIRLY_DATABASE_URL   e.g. sqlite+aiosqlite:///./pairly.db
#                         or   postgresql+asyncpg://pairly:secret@host:5432/pairly
#   AWS_ACCESS_KEY_ID     S3-compatible key
#   AWS_SECRET_ACCESS_KEY S3-compatible secret
#   PAIRLY_BACKUP_BUCKET  bucket name, e.g. pairly-backups
# Optional:
#   AWS_ENDPOINT_URL_S3   e.g. https://s3.ru-1.storage.selcloud.ru  (non-AWS providers)
#   AWS_REGION            e.g. ru-1 (default us-east-1)
#   PAIRLY_BACKUP_PREFIX  default: pairly   (key prefix inside the bucket)
#   PAIRLY_LOCAL_DIR      default: /var/backups/pairly
#   LOG_FILE              default: /var/log/pairly/backup.log
#   PAIRLY_BACKUP_SSE     default: AES256   server-side encryption algorithm.
#                         Set to "aws:kms" to use SSE-KMS (and set
#                         PAIRLY_BACKUP_KMS_KEY_ID to a valid key ARN/id).
#   PAIRLY_BACKUP_KMS_KEY_ID  only used when PAIRLY_BACKUP_SSE=aws:kms.
#                         Appended as --sse-kms-key-id. Leave empty for
#                         the AWS-managed key default.

set -euo pipefail

# Load env file if present (so cron runs without a wrapper).
if [[ -r /etc/pairly/pairly.env ]]; then
	# shellcheck disable=SC1091
	set -o allexport; . /etc/pairly/pairly.env; set +o allexport
fi

# --- config -------------------------------------------------------------

: "${PAIRLY_DATABASE_URL:?PAIRLY_DATABASE_URL is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"
: "${PAIRLY_BACKUP_BUCKET:?PAIRLY_BACKUP_BUCKET is required}"

AWS_ENDPOINT_URL_S3="${AWS_ENDPOINT_URL_S3:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PREFIX="${PAIRLY_BACKUP_PREFIX:-pairly}"
LOCAL_DIR="${PAIRLY_LOCAL_DIR:-/var/backups/pairly}"
LOG_FILE="${LOG_FILE:-/var/log/pairly/backup.log}"
AWS_BIN="${AWS_BIN:-aws}"

BUCKET_URI="s3://${PAIRLY_BACKUP_BUCKET}/${PREFIX}"
mkdir -p "$LOCAL_DIR" "$(dirname "$LOG_FILE")"

# --- helpers ------------------------------------------------------------

log() {
	printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >> "$LOG_FILE" 2>&1 || \
		printf '%s %s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$*" >&2
}

die() {
	log "ERROR: $*"
	exit 1
}

require() {
	command -v "$1" >/dev/null 2>&1 || die "missing required binary: $1"
}

# Build the aws s3 global args (endpoint override for S3-compatible providers,
# server-side encryption, optional KMS key id).
# Emits args to stdout, one per line (caller reads into an array).
s3_global_args() {
	if [[ -n "$AWS_ENDPOINT_URL_S3" ]]; then
		printf -- '--endpoint-url\n%s\n' "$AWS_ENDPOINT_URL_S3"
	fi
	printf -- '--region\n%s\n' "$AWS_REGION"
	# Server-side encryption. Default SSE-S3 (AES256); opt in to SSE-KMS
	# by setting PAIRLY_BACKUP_SSE=aws:kms + PAIRLY_BACKUP_KMS_KEY_ID.
	printf -- '--sse\n%s\n' "${PAIRLY_BACKUP_SSE:-AES256}"
	if [[ -n "${PAIRLY_BACKUP_KMS_KEY_ID:-}" ]]; then
		printf -- '--sse-kms-key-id\n%s\n' "$PAIRLY_BACKUP_KMS_KEY_ID"
	fi
}

# --- preflight ----------------------------------------------------------

require "$AWS_BIN"

NOW="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
HOURLY_KEY="${BUCKET_URI}/${NOW}.dump"
HOST="$(hostname -s)"

scheme="$(printf '%s' "$PAIRLY_DATABASE_URL" | awk -F+ '{print $1}')"
log "pairly backup start host=${HOST} scheme=${scheme}"

# --- produce the dump ---------------------------------------------------

DUMP_FILE="${LOCAL_DIR}/pairly-${NOW}.dump"
# Clean up the local dump file on ANY script exit (success, error, signal).
# This trap lives at script scope, so it fires once at the END of the script.
# Inside `apply_retention()` below, a SEPARATE function-scoped `RETURN` trap
# cleans up its own `$tmp` scratch files when the function returns — those
# are a different lifecycle, so the two traps are NOT redundant. See the
# comment inside `apply_retention` for why the inner trap must be `RETURN`,
# not `EXIT` (a script-scope EXIT trap would leave the scratch files behind
# if the function short-circuited via `set -e`).
trap 'rm -f "$DUMP_FILE"' EXIT

case "$scheme" in
	sqlite)
		command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 not installed"
		# Derive the file path from the URL. SQLAlchemy convention:
		#   sqlite:///foo.db          (3 slashes) -> relative "foo.db"
		#   sqlite:///./pairly.db                 -> relative "./pairly.db"
		#   sqlite:////var/lib/x.db  (4 slashes) -> absolute "/var/lib/x.db"
		rest="${PAIRLY_DATABASE_URL#*://}"   # drop "sqlite(+driver)://"
		# rest is now "/foo.db", "/./pairly.db", or "//var/lib/x.db"
		if [[ "$rest" == //* ]]; then
			path="/${rest#//}"    # 4-slash form: absolute path
		else
			path="${rest#/}"      # 3-slash form: drop the single leading slash
		fi
		[[ -n "$path" ]] || die "could not parse sqlite path from DATABASE_URL"
		[[ -f "$path" ]] || die "sqlite db file not found: $path"
		log "sqlite3 .backup -> $DUMP_FILE (source=$path)"
		# `.backup` is an online-consistent snapshot safe while the bot writes.
		sqlite3 "$path" ".backup '$DUMP_FILE'"
		;;
	postgresql)
		command -v pg_dump >/dev/null 2>&1 || die "pg_dump not installed"
		# Strip the async driver so libpq understands the URL.
		pg_url="${PAIRLY_DATABASE_URL/+asyncpg/}"
		log "pg_dump -> $DUMP_FILE"
		PGPASSWORD="${PGPASSWORD:-}" pg_dump --no-owner --clean --if-exists \
			--format=custom --dbname="$pg_url" --file="$DUMP_FILE"
		;;
	*)
		die "unsupported DATABASE_URL scheme: $scheme (expected sqlite* or postgresql*)"
		;;
esac

[[ -s "$DUMP_FILE" ]] || die "dump file is empty: $DUMP_FILE"

# --- upload -------------------------------------------------------------

# Read aws global args into an array.
mapfile -t S3_ARGS < <(s3_global_args)

log "upload -> ${HOURLY_KEY}"
"$AWS_BIN" "${S3_ARGS[@]}" s3 cp "$DUMP_FILE" "$HOURLY_KEY" \
	|| die "upload failed for $HOURLY_KEY"

# --- retention ----------------------------------------------------------
# Strategy (applied by deleting objects that fall outside all keep rules):
#   KEEP if age <= 24h                      (hourly bucket)
#   KEEP if it is the newest object of its calendar day AND that day is within
#         the last 7 days                   (7 dailies)
#   KEEP if it is the newest object of its ISO week AND that week is within
#         the last 4 weeks                  (4 weeklies)
#   otherwise DELETE.

apply_retention() {
	local tmp
	tmp="$(mktemp)"
	# Function-scoped RETURN trap: cleans up the two scratch files
	# (`$tmp` for `aws s3 ls` output, `${tmp}.age` for parsed per-key
	# metadata) when this function returns — whether by reaching the end
	# of the block or by `set -e` short-circuiting on a failed command.
	# This is intentionally NOT a script-scope EXIT trap, because the
	# retention scratch files are only meaningful while this function
	# runs. A script-scope trap would also fire (correctly) when the
	# script exits, but would NOT fire when the function returns mid-way
	# via `return 0` from the s3 ls WARN branch below, leaking `$tmp`
	# on that path. RETURN traps are bash 4.0+ (Ubuntu 20.04+, the
	# minimum supported platform), so they are safe to rely on.
	trap 'rm -f "$tmp" "${tmp}.age"' RETURN

	# List keys under the prefix. Output: "DATE TIME SIZE KEY"
	if ! "$AWS_BIN" "${S3_ARGS[@]}" s3 ls --recursive "${BUCKET_URI}/" > "$tmp" 2>/dev/null; then
		log "WARN: could not list bucket for retention; skipping retention pass"
		return 0
	fi

	local now_epoch
	now_epoch="$(date -u '+%s')"

	# Parse each key's ISO timestamp from its basename into epoch + day + week.
	# Uses GNU `date -d` (always present on Ubuntu/Debian VPS) instead of awk's
	# mktime/strftime, which are gawk-only (not in stock mawk).
	# Normalize every key to a FULL s3 URI so the later `s3 rm` works (aws-cli's
	# `s3 ls --recursive` prints relative keys, not full URIs).
	# Emit lines: epoch<TAB>day<TAB>iso_week<TAB>full_key   (sorted by epoch asc)
	: > "${tmp}.age"
	while read -r _ _ _ key; do
		# key is either  s3://bucket/pairly/2026-06-15T07:07:00Z.dump  (full)
		#          or    pairly/2026-06-15T07:07:00Z.dump               (relative)
		case "$key" in
			s3://*) rel="${key#s3://"${PAIRLY_BACKUP_BUCKET}"/}" ;;
			*)      rel="$key" ;;
		esac
		base="$(basename "$rel")"
		base="${base%.dump}"      # 2026-06-15T07:07:00Z
		# GNU date parses ISO8601; feed it as explicit UTC.
		epoch="$(date -u -d "${base//Z/+00:00}" '+%s' 2>/dev/null || true)"
		[[ -n "$epoch" ]] || continue
		day="$(date -u -d "@${epoch}" '+%Y-%m-%d')"
		week="$(date -u -d "@${epoch}" '+%G-W%V')"
		# Store the full URI for s3 rm.
		full_uri="s3://${PAIRLY_BACKUP_BUCKET}/${rel}"
		printf '%s\t%s\t%s\t%s\n' "$epoch" "$day" "$week" "$full_uri" >> "${tmp}.age"
	done < "$tmp"
	sort -t$'\t' -k1,1n -o "${tmp}.age" "${tmp}.age"

	# Determine keep sets: newest per day, newest per week.
	declare -A newest_day newest_week
	while IFS=$'\t' read -r epoch day week key; do
		newest_day["$day"]="$key"
		newest_week["$week"]="$key"
	done < "${tmp}.age"

	local deleted=0 key epoch day week age
	while IFS=$'\t' read -r epoch day week key; do
		age=$(( (now_epoch - epoch) / 3600 ))
		# Rule 1: keep last 24h.
		(( age <= 24 )) && continue
		# Rule 2: newest of the day, day within 7 days (168h, +24h slop).
		if [[ "${newest_day[$day]:-}" == "$key" ]] && (( age <= 192 )); then
			continue
		fi
		# Rule 3: newest of the ISO week, week within 4 weeks (672h, +48h slop).
		if [[ "${newest_week[$week]:-}" == "$key" ]] && (( age <= 720 )); then
			continue
		fi
		if "$AWS_BIN" "${S3_ARGS[@]}" s3 rm "$key" >/dev/null 2>&1; then
			log "retention: deleted $key (age=${age}h)"
			deleted=$((deleted + 1))
		else
			log "WARN: could not delete $key"
		fi
	done < "${tmp}.age"

	log "retention pass complete (deleted=${deleted})"
}

apply_retention || log "WARN: retention pass errored; backups remain safe"

# --- done ---------------------------------------------------------------

SIZE="$(stat -c%s "$DUMP_FILE" 2>/dev/null || printf '?')"
log "pairly backup OK key=${HOURLY_KEY} size=${SIZE} bytes"
exit 0
