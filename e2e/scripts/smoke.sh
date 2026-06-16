#!/usr/bin/env bash
#
# Pairly API daily smoke — cron-able health check.
#
# Hits /api/health on the Mini App API (pairly-api) and exits non-zero on failure,
# so a cron wrapper / monitoring hook can alert. Pairly scopes the check to the ONE
# endpoint that must always be up: /api/health (see backend/pairly/api/app.py).
#
# Usage:
#   E2E_API_URL=https://pairly.example.com ./e2e/scripts/smoke.sh
#
# Cron example (daily 09:00, Europe/Moscow TZ set elsewhere):
#   0 9 * * *  E2E_API_URL=https://pairly.example.com /opt/pairly/e2e/scripts/smoke.sh >> /var/log/pairly/smoke.log 2>&1
#
set -euo pipefail

API_URL="${E2E_API_URL:-http://localhost:8000}"
TIMEOUT="${E2E_SMOKE_TIMEOUT:-10}"
ENDPOINT="${API_URL%/}/api/health"

# shellcheck disable=SC2012
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] smoke: GET ${ENDPOINT}"

http_code="$(
  curl --silent --show-error --max-time "${TIMEOUT}" \
    --output /tmp/pairly_smoke_body.$$ \
    --write-out '%{http_code}' \
    "${ENDPOINT}" 2>/tmp/pairly_smoke_err.$$ || true
)"
curl_rc=$?
body="$(cat /tmp/pairly_smoke_body.$$ 2>/dev/null || true)"
err="$(cat /tmp/pairly_smoke_err.$$ 2>/dev/null || true)"
rm -f /tmp/pairly_smoke_body.$$ /tmp/pairly_smoke_err.$$

if [[ "${http_code}" != "200" ]]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] smoke FAIL: http=${http_code} curl_rc=${curl_rc} body='${body}' err='${err}'" >&2
  exit 1
fi

# Body must be exactly {"status":"ok"} (whitespace-tolerant).
if ! printf '%s' "${body}" | grep -Eq '"status"[[:space:]]*:[[:space:]]*"ok"'; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] smoke FAIL: 200 but unexpected body='${body}'" >&2
  exit 1
fi

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] smoke OK"
exit 0
