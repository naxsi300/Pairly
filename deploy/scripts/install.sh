#!/usr/bin/env bash
# Pairly VPS provisioner. Idempotent: safe to re-run on an existing install.
#
# What it does:
#   1. Creates a dedicated `pairly` system user + group.
#   2. Installs system deps (python3.12, sqlite3, caddy, jq, awscli, curl).
#   3. Installs `uv` (astral-sh/uv).
#   4. Clones-or-pulls the repo into /opt/pairly, runs `uv sync`.
#   5. Runs `alembic upgrade head` (DATABASE_URL permitting).
#   6. Copies systemd units, reloads, enables + starts bot+api.
#   7. Installs the Caddyfile (does NOT reload caddy unless domain is real).
#   8. Installs the hourly backup cron + /etc/pairly/pairly.env skeleton.
#
# Assumptions:
#   - Run as root on a fresh Ubuntu/Debian VPS.
#   - The env file /etc/pairly/pairly.env already holds secrets (bot token, DB url,
#     S3 creds). If missing, a template is created; services will fail to start
#     until you fill it in.
#
# Usage:
#   sudo ./install.sh                 # use defaults
#   sudo REPO_URL=git@... ./install.sh   # override repo url
#   sudo SKIP_START=1 ./install.sh    # install without starting services

set -euo pipefail

# --- config -------------------------------------------------------------

REPO_URL="${REPO_URL:-https://github.com/PAIRLY/pairly.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/pairly}"
SERVICE_USER="${SERVICE_USER:-pairly}"
ENV_FILE="${ENV_FILE:-/etc/pairly/pairly.env}"
LOCAL_RUNNER="${LOCAL_RUNNER:-$USER}"
SKIP_START="${SKIP_START:-0}"

log() { printf '\033[1m[install]\033[0m %s\n' "$*"; }
die() { printf '\033[1m[install ERROR]\033[0m %s\n' "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run as root (sudo)"

. /etc/os-release 2>/dev/null || die "unsupported OS (no /etc/os-release)"

# --- 1. service user ----------------------------------------------------

if ! id "$SERVICE_USER" >/dev/null 2>&1; then
	log "creating user $SERVICE_USER"
	useradd --system --create-home --home-dir "/var/lib/${SERVICE_USER}" \
		--shell /usr/sbin/nologin "$SERVICE_USER"
fi

# --- 2. system packages -------------------------------------------------

install_packages() {
	case "$ID" in
		debian|ubuntu)
			export DEBIAN_FRONTEND=noninteractive
			apt-get update -y
			apt-get install -y --no-install-recommends \
				ca-certificates curl gnupg sqlite3 jq python3 python3-venv \
				python3-pip git cron
			# Caddy official repo (one-time).
			if ! command -v caddy >/dev/null 2>&1; then
				apt-get install -y --no-install-recommends debian-keyring debian-archive-keyring apt-transport-https || true
				curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
					| gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
				curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
					> /etc/apt/sources.list.d/caddy-stable.list
				apt-get update -y
				apt-get install -y caddy
			fi
			# awscli v2 (preferred); fall back to v1 from apt.
			if ! command -v aws >/dev/null 2>&1; then
				if [[ "$ID" == "ubuntu" ]] && [[ "${VERSION_ID:-22.04}" == "24.04" || "${VERSION_ID:-22.04}" == "22.04" ]]; then
					curl -fsSLo /tmp/awscliv2.zip "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" \
						&& unzip -q /tmp/awscliv2.zip -d /tmp \
						&& /tmp/aws/install --update || apt-get install -y awscli
					rm -rf /tmp/aws /tmp/awscliv2.zip
				else
					apt-get install -y awscli
				fi
			fi
			;;
		*)
			die "unsupported distro ID=$ID; install python3.12, sqlite3, caddy, awscli, uv manually"
			;;
	esac
}

install_packages

# Ensure python3.12 specifically (may differ from default python3).
if ! command -v python3.12 >/dev/null 2>&1; then
	case "$ID" in
		ubuntu)
			export DEBIAN_FRONTEND=noninteractive
			apt-get install -y --no-install-recommends software-properties-common
			add-apt-repository -y ppa:deadsnakes/ppa || true
			apt-get update -y
			apt-get install -y python3.12 python3.12-venv || log "WARN: could not install python3.12; falling back to default python3"
			;;
		debian)
			# Debian bookworm ships 3.11; 3.12 may need backports. Skip if absent.
			log "WARN: python3.12 not found on Debian; ensure pyproject requires-python is met by default python3"
			;;
	esac
fi

# --- 3. uv --------------------------------------------------------------

install_uv() {
	if command -v uv >/dev/null 2>&1; then
		log "uv already installed: $(uv --version)"
		return
	fi
	log "installing uv"
	curl -LsSf https://astral.sh/uv/install.sh | sh
	# uv lands in ~/.local/bin for root; make it system-wide.
	ln -sf /root/.local/bin/uv /usr/local/bin/uv || \
		ln -sf /usr/local/bin/uv /usr/local/bin/uv
}

install_uv
command -v uv >/dev/null 2>&1 || die "uv install failed"

# --- 4. clone / pull + sync --------------------------------------------

ensure_repo() {
	if [[ -d "$INSTALL_DIR/.git" ]]; then
		log "pulling latest into $INSTALL_DIR"
		git -C "$INSTALL_DIR" fetch --all --prune
		git -C "$INSTALL_DIR" reset --hard '@{u}' 2>/dev/null || git -C "$INSTALL_DIR" pull --ff-only
	else
		log "cloning $REPO_URL -> $INSTALL_DIR"
		mkdir -p "$(dirname "$INSTALL_DIR")"
		git clone "$REPO_URL" "$INSTALL_DIR"
	fi
}

ensure_repo

# --- 5. env file skeleton ----------------------------------------------

ensure_env() {
	if [[ ! -f "$ENV_FILE" ]]; then
		log "creating env skeleton $ENV_FILE (FILL IN SECRETS)"
		install -d -m 0750 "$(dirname "$ENV_FILE")"
		cat > "$ENV_FILE" <<'EOF'
# Pairly runtime environment. chmod 600, owner pairly. Fill in all values.
PAIRLY_BOT_TOKEN=0000000000:CHANGE_ME
PAIRLY_DATABASE_URL=sqlite+aiosqlite:////var/lib/pairly/pairly.db
PAIRLY_API_HOST=127.0.0.1
PAIRLY_API_PORT=8000
PAIRLY_BOT_POLLING=true
PAIRLY_DEBUG=false

# Backups (required for backup.sh cron)
AWS_ACCESS_KEY_ID=CHANGE_ME
AWS_SECRET_ACCESS_KEY=CHANGE_ME
AWS_ENDPOINT_URL_S3=https://s3.example.com
AWS_REGION=ru-1
PAIRLY_BACKUP_BUCKET=pairly-backups
PAIRLY_BACKUP_PREFIX=pairly
EOF
		chmod 600 "$ENV_FILE"
		chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE"
		log "WARNING: $ENV_FILE has placeholders. Edit it before starting services."
	fi
}

ensure_env

# --- 6. venv + deps + migrate ------------------------------------------

# uv reads requires-python from pyproject; pin to 3.12 if available else default.
PYTHON_BIN="python3.12"
command -v "$PYTHON_BIN" >/dev/null 2>&1 || PYTHON_BIN="python3"

log "uv sync (python=$PYTHON_BIN)"
uv sync --python "$PYTHON_BIN"

# Migrate. Needs DATABASE_URL so alembic can connect. Source the env file.
log "alembic upgrade head"
if [[ -r "$ENV_FILE" ]]; then
	set -o allexport
	# shellcheck disable=SC1090,SC1091
	. "$ENV_FILE"
	set +o allexport
fi
# alembic reads sqlalchemy.url from ini, but env.py should override from PAIRLY_DATABASE_URL.
# Run from repo root so the relative script_location resolves.
if ! uv run alembic -c backend/pairly/migrations/alembic.ini upgrade head; then
	log "WARN: alembic upgrade failed; continuing (fill in DATABASE_URL and re-run)."
fi

# Give the service user ownership of the tree it writes to.
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR" 2>/dev/null || true
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0750 /var/lib/pairly /var/log/pairly

# --- 7. systemd units ---------------------------------------------------

install_units() {
	log "installing systemd units"
	install -m 0644 "$INSTALL_DIR/deploy/systemd/pairly-bot.service" /etc/systemd/system/pairly-bot.service
	install -m 0644 "$INSTALL_DIR/deploy/systemd/pairly-api.service" /etc/systemd/system/pairly-api.service
	# Make sure the venv path the units reference matches reality.
	sed -i "s|/opt/pairly|${INSTALL_DIR}|g" \
		/etc/systemd/system/pairly-bot.service \
		/etc/systemd/system/pairly-api.service
	systemctl daemon-reload
	systemctl enable --now pairly-api.service >/dev/null 2>&1 || \
		log "NOTE: pairly-api enable failed (fill env, then: systemctl start pairly-api)"
	systemctl enable --now pairly-bot.service >/dev/null 2>&1 || \
		log "NOTE: pairly-bot enable failed (fill env, then: systemctl start pairly-bot)"
}

install_units

# --- 8. caddy -----------------------------------------------------------

install_caddy() {
	log "installing Caddyfile"
	install -d -m 0755 /etc/caddy
	install -m 0644 "$INSTALL_DIR/deploy/caddy/Caddyfile" /etc/caddy/Caddyfile
	# Only reload if the domain is no longer the placeholder.
	if ! grep -q 'app.example.com' /etc/caddy/Caddyfile; then
		systemctl reload caddy || systemctl restart caddy
	else
		log "Caddyfile still uses placeholder domain; edit /etc/caddy/Caddyfile then: systemctl reload caddy"
	fi
}

install_caddy

# --- 9. backup cron -----------------------------------------------------

install_cron() {
	log "installing hourly backup cron"
	install -d -m 0755 /var/backups/pairly
	install -m 0755 "$INSTALL_DIR/deploy/scripts/backup.sh" /usr/local/sbin/pairly-backup.sh
	install -m 0755 "$INSTALL_DIR/deploy/scripts/restore.sh" /usr/local/sbin/pairly-restore.sh
	# Cron runs as root so it can read /etc/pairly/pairly.env; the script loads it.
	cat > /etc/cron.d/pairly-backup <<EOF
# Pairly hourly DB backup. Managed by deploy/scripts/install.sh.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
7 * * * * root /usr/local/sbin/pairly-backup.sh
EOF
	chmod 0644 /etc/cron.d/pairly-backup
	systemctl reload cron 2>/dev/null || systemctl reload crond 2>/dev/null || true
}

install_cron

# --- done ---------------------------------------------------------------

log "install complete."
log "Next steps:"
log "  1. Edit $ENV_FILE (bot token, DB url, S3 creds)."
log "  2. Edit /etc/caddy/Caddyfile (replace app.example.com)."
log "  3. sudo systemctl restart pairly-bot pairly-api"
log "  4. sudo systemctl reload caddy"
log "  5. Test a backup: sudo /usr/local/sbin/pairly-backup.sh"
exit 0
