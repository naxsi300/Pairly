.PHONY: install test lint bot api migrate seed clean backup deploy deploy-pull e2e e2e-playwright e2e-bot

install:
	uv sync --extra dev

test:
	uv run pytest -q

lint:
	uv run ruff check .

bot:
	uv run python -m pairly.main

api:
	uv run uvicorn pairly.api.app:app --host 127.0.0.1 --port 8000 --reload

migrate:
	uv run alembic -c backend/pairly/migrations/alembic.ini upgrade head

seed:
	uv run python -m pairly.db.seed

clean:
	rm -f pairly.db test.db test_migrate.db

# --- infra convenience (local) ------------------------------------------
# Run the backup script against the LOCAL dev DB (SQLite default).
# Reads PAIRLY_DATABASE_URL + S3 creds from the environment; set them or .env.
backup:
	@if [ -z "$${PAIRLY_BACKUP_BUCKET:-}" ]; then \
		echo "Set PAIRLY_BACKUP_BUCKET (+ AWS creds) first; see deploy/scripts/backup.sh"; exit 1; \
	fi
	PAIRLY_DATABASE_URL="$${PAIRLY_DATABASE_URL:-sqlite+aiosqlite:///./pairly.db}" \
	PAIRLY_LOCAL_DIR="$${PAIRLY_LOCAL_DIR:-./.backups}" \
	LOG_FILE="$${LOG_FILE:-./.backups/backup.log}" \
	bash deploy/scripts/backup.sh

# Re-run the idempotent VPS installer (assumes you can sudo). Intended for the
# VPS, not your laptop — harmless to dry-run with SKIP_START=1 locally.
deploy:
	sudo bash deploy/scripts/install.sh

# Pull + build Mini App (npm on the VPS) + rebuild backend + restart. Run on the VPS.
deploy-pull:
	bash deploy/scripts/deploy.sh

# --- e2e (qa-e2e) --------------------------------------------------------
# Runs the Playwright Mini App suite (mock mode) + the in-process pytest bot e2e.
# Mock mode is the default: the Mini App runs against its client-side mock so
# scenarios over unimplemented backend endpoints (bucket/mood/qotd/gifts) still
# pass. To also run the real-API subset: E2E_RUN_REAL_API=1 make e2e-playwright
# (with `make api` running in another terminal).
#
# WHY the build needs VITE_API_URL: the mock (miniapp/src/sdk/mock.ts) parses the
# request URL with `new URL(...)`, which REQUIRES an absolute URL. When
# VITE_API_URL is empty the app passes a bare "/api/..." path and the mock throws.
# So we build with both VITE_USE_MOCK=true and a dummy absolute VITE_API_URL; the
# host is irrelevant because the mock only inspects url.pathname.
E2E_DIR          ?= e2e
E2E_MINIAPP_PORT ?= 5173
E2E_MINIAPP_URL  ?= http://127.0.0.1:$(E2E_MINIAPP_PORT)
MINIAPP_DIR      ?= miniapp

e2e: e2e-playwright e2e-bot

# Playwright against the built Mini App served by `vite preview`, in MOCK mode.
# Builds the miniapp with mock env, boots preview on the e2e port, runs specs,
# tears the server down. Installs browsers on first run if needed.
e2e-playwright:
	@set -e; \
	echo "==> building Mini App (mock mode)"; \
	cd $(MINIAPP_DIR) && ([ -d node_modules ] || npm install); \
	VITE_USE_MOCK=true VITE_API_URL=http://localhost:8000 npm run build >/tmp/pairly_e2e_build.log 2>&1; \
	echo "==> starting vite preview on $(E2E_MINIAPP_PORT)"; \
	npx vite preview --port $(E2E_MINIAPP_PORT) --host 127.0.0.1 >/tmp/pairly_e2e_vite.log 2>&1 & \
	VITE_PID=$$!; \
	sleep 2; \
	( curl -sS -m 5 -o /dev/null http://127.0.0.1:$(E2E_MINIAPP_PORT) || \
	  (echo "vite preview did not come up; see /tmp/pairly_e2e_vite.log"; cat /tmp/pairly_e2e_vite.log; kill $$VITE_PID 2>/dev/null; exit 1) ); \
	trap "kill $$VITE_PID 2>/dev/null || true" EXIT INT TERM; \
	echo "==> running Playwright"; \
	cd ../$(E2E_DIR) && ([ -d node_modules ] || npm install); \
	( npx playwright install chromium 2>/dev/null || true ); \
	E2E_MINIAPP_URL=$(E2E_MINIAPP_URL) npx playwright test; RC=$$?; \
	exit $$RC

# In-process pytest bot e2e (invite->accept->dissolve, forward->wishlist). No Telegram.
e2e-bot:
	uv run pytest $(E2E_DIR)/bot -q

