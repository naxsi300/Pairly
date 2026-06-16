#!/usr/bin/env bash
# Pairly DB restore — interactive picker over recent S3 snapshots.
#
# Lists the most recent snapshots in the bucket, lets you choose one, downloads
# it, then restores it into the configured DATABASE_URL.
#
#   sqlite     -> replaces the live .db file (with a .pre-restore backup first)
#   postgres   -> pg_restore --clean --if-exists
#
# Destructive: asks for confirmation before writing. Safe to re-run.
#
# Usage:
#   ./restore.sh                 # interactive
#   ./restore.sh --key KEY       # non-interactive, exact full s3:// key
#   ./restore.sh --latest        # non-interactive, newest snapshot

set -euo pipefail

if [[ -r /etc/pairly/pairly.env ]]; then
	# shellcheck disable=SC1091
	set -o allexport; . /etc/pairly/pairly.env; set +o allexport
fi

: "${PAIRLY_DATABASE_URL:?PAIRLY_DATABASE_URL is required}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID is required}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY is required}"
: "${PAIRLY_BACKUP_BUCKET:?PAIRLY_BACKUP_BUCKET is required}"

AWS_ENDPOINT_URL_S3="${AWS_ENDPOINT_URL_S3:-}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PREFIX="${PAIRLY_BACKUP_PREFIX:-pairly}"
LOCAL_DIR="${PAIRLY_LOCAL_DIR:-/var/backups/pairly}"

AWS_BIN="${AWS_BIN:-aws}"
BUCKET_URI="s3://${PAIRLY_BACKUP_BUCKET}/${PREFIX}"

mkdir -p "$LOCAL_DIR"

log() { printf '%s\n' "$*" >&2; }
die() { log "ERROR: $*"; exit 1; }

s3_global_args() {
	if [[ -n "$AWS_ENDPOINT_URL_S3" ]]; then
		printf -- '--endpoint-url\n%s\n' "$AWS_ENDPOINT_URL_S3"
	fi
	printf -- '--region\n%s\n' "$AWS_REGION"
}
mapfile -t S3_ARGS < <(s3_global_args)

# --- choose a snapshot --------------------------------------------------

# Normalize a raw `s3 ls` key (full URI or relative path) to a full s3 URI.
normalize_key() {
	local k="$1"
	case "$k" in
		s3://*) printf '%s' "$k" ;;
		*)      printf 's3://%s/%s' "$PAIRLY_BACKUP_BUCKET" "${k#/}" ;;
	esac
}

# Print newest-first full-URI list of dump keys.
list_keys() {
	"$AWS_BIN" "${S3_ARGS[@]}" s3 ls --recursive "${BUCKET_URI}/" \
		| awk '{print $NF}' | grep -E '\.dump$' | sort | while read -r k; do normalize_key "$k"; done
}

CHOOSE_KEY=""
if [[ "${1:-}" == "--latest" ]]; then
	CHOOSE_KEY="$(list_keys | tail -n1)"
	[[ -n "$CHOOSE_KEY" ]] || die "no snapshots found under ${BUCKET_URI}/"
elif [[ "${1:-}" == "--key" ]]; then
	CHOOSE_KEY="$(normalize_key "${2:?--key requires a value}")"
else
	# Interactive: show the 15 newest, prompt.
	mapfile -t KEYS < <(list_keys | tail -n15)
	[[ ${#KEYS[@]} -gt 0 ]] || die "no snapshots found under ${BUCKET_URI}/"

	log "Recent snapshots (newest last):"
	for i in "${!KEYS[@]}"; do
		# Friendly label: strip bucket/prefix + .dump for display.
		label="${KEYS[$i]#s3://${PAIRLY_BACKUP_BUCKET}/}"
		label="${label%.dump}"
		printf '  [%2d] %s\n' "$((i+1))" "$label" >&2
	done
	printf '\nPick a number (1-%d): ' "${#KEYS[@]}" >&2
	read -r choice
	[[ "$choice" =~ ^[0-9]+$ ]] || die "invalid choice"
	(( choice >= 1 && choice <= ${#KEYS[@]} )) || die "choice out of range"
	CHOOSE_KEY="${KEYS[$((choice-1))]}"
fi

log "Selected: $CHOOSE_KEY"

BASENAME="$(basename "$CHOOSE_KEY")"
DL_FILE="${LOCAL_DIR}/restore-${BASENAME}"
log "Downloading -> $DL_FILE"
"$AWS_BIN" "${S3_ARGS[@]}" s3 cp "$CHOOSE_KEY" "$DL_FILE"
[[ -s "$DL_FILE" ]] || die "downloaded file is empty"

# --- confirm ------------------------------------------------------------

scheme="$(printf '%s' "$PAIRLY_DATABASE_URL" | awk -F+ '{print $1}')"
log ""
log "About to RESTORE $DL_FILE into:"
log "  DB:  $PAIRLY_DATABASE_URL"
log "  Key: $CHOOSE_KEY"
log "This overwrites live data. Type the word 'restore' to proceed:"
read -r confirm
[[ "$confirm" == "restore" ]] || die "aborted"

# --- restore ------------------------------------------------------------

case "$scheme" in
	sqlite)
		command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 not installed"
		rest="${PAIRLY_DATABASE_URL#*://}"
		if [[ "$rest" == //* ]]; then
			path="/${rest#//}"
		else
			path="${rest#/}"
		fi
		[[ -n "$path" ]] || die "could not parse sqlite path from DATABASE_URL"
		pre="${path}.pre-restore.$(date -u '+%Y%m%dT%H%M%SZ')"
		if [[ -f "$path" ]]; then
			log "saving current db -> $pre"
			cp -a "$path" "$pre"
		fi
		# Restore by copying the backup file over the live db. Stop the services
		# first for safety (documented in runbook).
		log "restoring $DL_FILE -> $path"
		cp -a "$DL_FILE" "$path"
		log "sqlite restore complete. Pre-restore copy: $pre"
		log "Run:  sudo systemctl restart pairly-bot pairly-api"
		;;
	postgresql)
		command -v pg_restore >/dev/null 2>&1 || die "pg_restore not installed"
		pg_url="${PAIRLY_DATABASE_URL/+asyncpg/}"
		log "pg_restore -> $pg_url"
		PGPASSWORD="${PGPASSWORD:-}" pg_restore --no-owner --clean --if-exists \
			--dbname="$pg_url" "$DL_FILE" || \
			log "NOTE: pg_restore reported non-zero (common with --clean on missing tables). Verify data."
		log "postgres restore complete."
		log "Run:  sudo systemctl restart pairly-bot pairly-api"
		;;
	*)
		die "unsupported DATABASE_URL scheme: $scheme"
		;;
esac

rm -f "$DL_FILE"
log "Done."
exit 0
