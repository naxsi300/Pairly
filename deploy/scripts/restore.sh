#!/usr/bin/env bash
# Pairly DB restore — interactive picker over recent S3 snapshots.
#
# Lists the most recent snapshots in the bucket, lets you choose one, downloads
# it, then restores it into the configured DATABASE_URL.
#
#   sqlite     -> uses `sqlite3 ... .restore` (online-consistent; locks held safely)
#   postgres   -> pg_restore --clean --if-exists
#
# Destructive: asks for confirmation before writing. Safe to re-run.
#
# LOCK-SAFETY: if pairly-bot / pairly-api are running (under systemd OR
# docker compose), the script refuses to start unless one of the override
# flags is passed:
#   --force                 trust that you've stopped the services yourself
#   --i-know-what-im-doing  auto-stop them now and auto-restart after restore
#
# Usage:
#   ./restore.sh                 # interactive
#   ./restore.sh --key KEY       # non-interactive, exact full s3:// key
#   ./restore.sh --latest        # non-interactive, newest snapshot
#   ./restore.sh --force --latest  # skip the running-services guard

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

# --- flag parsing --------------------------------------------------------

FORCE_RESTORE=0
AUTO_STOP_START=0
# Collect non-flag args for the snapshot picker.
PICK_ARGS=()
for arg in "$@"; do
	case "$arg" in
		--force)
			FORCE_RESTORE=1
			;;
		--i-know-what-im-doing)
			FORCE_RESTORE=1
			AUTO_STOP_START=1
			;;
		--latest|--key)
			PICK_ARGS+=("$arg")
			;;
		*)
			# Only allow one positional after --key.
			if [[ "${PICK_ARGS[0]:-}" == "--key" ]] && [[ ${#PICK_ARGS[@]} -lt 2 ]]; then
				PICK_ARGS+=("$arg")
			fi
			;;
	esac
done

# --- lock-safety: detect running pairly services -------------------------
#
# The pairly bot holds the SQLite WAL writer. Overwriting the .db while
# the bot is alive = torn page / SQLITE_CORRUPT. We refuse unless the
# operator passes --force (services are already stopped) or
# --i-know-what-im-doing (we'll stop and restart them).

is_service_active() {
	local unit="$1"
	systemctl is-active --quiet "$unit" 2>/dev/null
}

is_docker_pairly_running() {
	# `docker compose ps --status running` or `docker ps` filtered by name.
	# Works with compose v2 (`docker compose`) and v1 fallback (`docker-compose`).
	if command -v docker >/dev/null 2>&1; then
		if docker compose ps --status running 2>/dev/null \
			| grep -Eq '\b(pairly-bot|pairly-api)\b'; then
			return 0
		fi
	fi
	return 1
}

detect_running_services() {
	local active=()
	if is_service_active pairly-bot.service; then active+=("pairly-bot (systemd)"); fi
	if is_service_active pairly-api.service; then active+=("pairly-api (systemd)"); fi
	if is_docker_pairly_running;              then active+=("docker compose (pairly)"); fi
	printf '%s\n' "${active[@]}"
}

running="$(detect_running_services)"
if [[ -n "$running" ]] && (( ! FORCE_RESTORE )); then
	{
		echo "ERROR: pairly services are currently running:"
		# `printf %s\n` over an array-of-strings: we joined into a single
		# newline-separated string in detect_running_services(), so just
		# print each line.
		while IFS= read -r line; do
			printf '  - %s\n' "$line"
		done <<< "$running"
		echo
		echo "Refusing to restore a SQLite db while the bot holds the WAL writer."
		echo "Pass one of:"
		echo "  --force                 (you've already stopped the services)"
		echo "  --i-know-what-im-doing  (stop them now and restart after restore)"
	} >&2
	exit 2
fi

# Auto-stop/start helpers (only used when --i-know-what-im-doing).
# shellcheck disable=SC2317  # invoked via EXIT trap / AUTO_STOP_START branch
STOPPED_BY_US=()
stop_pairly_services() {  # shellcheck disable=SC2317
	if is_service_active pairly-bot.service; then
		systemctl stop pairly-bot.service && STOPPED_BY_US+=("pairly-bot.service")
	fi
	if is_service_active pairly-api.service; then
		systemctl stop pairly-api.service && STOPPED_BY_US+=("pairly-api.service")
	fi
	if is_docker_pairly_running; then
		docker compose stop pairly-bot pairly-api \
			&& STOPPED_BY_US+=("docker compose pairly")
	fi
}
start_pairly_services() {  # shellcheck disable=SC2317
	for svc in "${STOPPED_BY_US[@]}"; do
		case "$svc" in
			pairly-bot.service)  systemctl start pairly-bot.service  || true ;;
			pairly-api.service)  systemctl start pairly-api.service  || true ;;
			docker*)             docker compose start pairly-bot pairly-api || true ;;
		esac
	done
}
trap '[[ ${#STOPPED_BY_US[@]} -gt 0 ]] && start_pairly_services' EXIT

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
if [[ "${PICK_ARGS[0]:-}" == "--latest" ]]; then
	CHOOSE_KEY="$(list_keys | tail -n1)"
	[[ -n "$CHOOSE_KEY" ]] || die "no snapshots found under ${BUCKET_URI}/"
elif [[ "${PICK_ARGS[0]:-}" == "--key" ]]; then
	CHOOSE_KEY="$(normalize_key "${PICK_ARGS[1]:?--key requires a value}")"
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

		# Lock-safety: if we got here with AUTO_STOP_START=1 and the
		# services were running, stop them NOW (the preflight guard
		# refused otherwise). Without this, the .restore call would
		# still block on the engine-level write lock.
		if (( AUTO_STOP_START )); then
			log "auto-stopping pairly services (--i-know-what-im-doing)"
			stop_pairly_services
			log "stopped: ${STOPPED_BY_US[*]}"
		fi

		# Snapshot the live db for forensic rollback. `cp -a` here is
		# safe: at this point pairly-bot/api are stopped (or --force
		# means the operator already stopped them), so no WAL writer
		# is touching the file.
		pre="${path}.pre-restore.$(date -u '+%Y%m%dT%H%M%SZ')"
		if [[ -f "$path" ]]; then
			log "saving current db -> $pre"
			cp -a "$path" "$pre"
		fi

		# Use the online-consistent .restore API (same engine the
		# backup script uses via .backup). `.timeout 5000` blocks up
		# to 5s for any lingering writer; in practice nothing should
		# be holding the lock at this point.
		log "restoring $DL_FILE -> $path (sqlite3 .restore)"
		sqlite3 "$path" ".timeout 5000" ".restore '$DL_FILE'" \
			|| die "sqlite3 .restore failed for $DL_FILE"

		# Integrity-check the just-restored db.
		if ! sqlite3 "$path" "PRAGMA integrity_check;" | grep -q '^ok$'; then
			die "post-restore integrity_check failed; pre-restore copy at $pre"
		fi

		log "sqlite restore complete. Pre-restore copy: $pre"
		if (( AUTO_STOP_START )); then
			log "auto-restarting pairly services (trap will run on EXIT)"
		else
			log "Run:  sudo systemctl restart pairly-bot pairly-api"
		fi
		;;
	postgresql)
		command -v pg_restore >/dev/null 2>&1 || die "pg_restore not installed"
		if (( AUTO_STOP_START )); then
			log "auto-stopping pairly services (--i-know-what-im-doing)"
			stop_pairly_services
			log "stopped: ${STOPPED_BY_US[*]}"
		fi
		pg_url="${PAIRLY_DATABASE_URL/+asyncpg/}"
		log "pg_restore -> $pg_url"
		PGPASSWORD="${PGPASSWORD:-}" pg_restore --no-owner --clean --if-exists \
			--dbname="$pg_url" "$DL_FILE" || \
			log "NOTE: pg_restore reported non-zero (common with --clean on missing tables). Verify data."
		log "postgres restore complete."
		if (( AUTO_STOP_START )); then
			log "auto-restarting pairly services (trap will run on EXIT)"
		else
			log "Run:  sudo systemctl restart pairly-bot pairly-api"
		fi
		;;
	*)
		die "unsupported DATABASE_URL scheme: $scheme"
		;;
esac

rm -f "$DL_FILE"
log "Done."
exit 0
