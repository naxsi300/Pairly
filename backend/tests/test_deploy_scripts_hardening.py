"""Cluster 9: deploy-scripts hardening static checks.

Three deploy scripts (install.sh, restore.sh, backup.sh) and one env example
(deploy/.env.prod.example) live in the operator's hands — they cannot be
unit-tested the normal way (they `exit 0` in CI by design; they touch
systemd/cron/etc.). What we CAN test in CI is that the dangerous patterns
the cluster 9 spec calls out are no longer present and the required
patterns are in place.

Contract points (one test per point, mirrors the cluster spec):
  (a) install.sh is idempotent:
        - No `git reset --hard '@{u}'` (destroys operator state)
        - Only `git pull --ff-only` for the update path
        - Caddyfile install guarded by `cmp -s` (skip if identical)
        - cron.d/pairly-backup install guarded by a marker grep
        - systemd unit install guarded (no unconditional overwrite)
  (b) restore.sh is lock-safe:
        - Detects active pairly services (systemctl is-active / docker compose ps)
        - Refuses to run unless --force (or --i-know-what-im-doing) is passed
        - sqlite path uses `sqlite3 ... .restore` (online-consistent), NOT `cp -a`
  (c) backup.sh uploads with server-side encryption:
        - s3 cp gets an --sse flag whose value references ${PAIRLY_BACKUP_SSE:-AES256}
        - KMS support: when PAIRLY_BACKUP_KMS_KEY_ID is non-empty, --sse-kms-key-id is appended
  (d) deploy/.env.prod.example documents PAIRLY_WEBHOOK_SECRET_TOKEN and PAIRLY_BACKUP_SSE
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
DEPLOY = REPO / "deploy"
SCRIPTS = DEPLOY / "scripts"
INSTALL = SCRIPTS / "install.sh"
RESTORE = SCRIPTS / "restore.sh"
BACKUP = SCRIPTS / "backup.sh"
ENV_EXAMPLE = DEPLOY / ".env.prod.example"


# All scripts must exist (regression).
@pytest.mark.parametrize("p", [INSTALL, RESTORE, BACKUP, ENV_EXAMPLE])
def test_files_exist(p: Path) -> None:
    assert p.exists(), f"missing: {p}"


# --- (a) install.sh idempotency ---------------------------------------------

def test_install_uses_ff_only_pull() -> None:
    """`git pull --ff-only` is the only safe update path for an operator
    working tree. The old `git reset --hard '@{u}'` would clobber any
    uncommitted local state (e.g. a hotfix the operator typed in by hand).
    """
    body = INSTALL.read_text(encoding="utf-8")
    # The dangerous command must be gone (allow it inside comments only).
    # A `\b` word-boundary on each side catches `git reset --hard` as a
    # real command, not a comment that mentions the words.
    code_lines = "\n".join(
        line.split("#", 1)[0] for line in body.splitlines()
    )
    assert not re.search(r"\bgit\s+reset\s+--hard\b", code_lines), (
        "install.sh: `git reset --hard` would destroy uncommitted operator state. "
        "Use `git pull --ff-only` only (warn but do not force on non-ff)."
    )
    # The safe line must be present.
    assert re.search(r"\bgit\s+pull\s+--ff-only\b", body), (
        "install.sh: expected `git pull --ff-only` for the update path"
    )


def test_install_caddyfile_guarded_by_cmp() -> None:
    """The Caddyfile install block must use `cmp -s` to skip if the
    destination is identical — re-running install.sh must not stomp on
    operator edits or rewrite the file byte-for-byte every time.
    """
    body = INSTALL.read_text(encoding="utf-8")
    # Caddyfile destination is /etc/caddy/Caddyfile.
    assert "/etc/caddy/Caddyfile" in body
    # There must be a `cmp -s` guard in the install path. Find the
    # install_caddy() function and check inside.
    m = re.search(r"install_caddy\(\)\s*\{(.*?)^\}", body, re.DOTALL | re.MULTILINE)
    assert m, "install.sh: install_caddy() function not found"
    caddy_section = m.group(1)
    assert re.search(r"cmp\s+-s\s+", caddy_section), (
        "install.sh: Caddyfile install must be guarded by `cmp -s` "
        "(only install if missing or differs)"
    )


def test_install_cron_guarded_by_marker() -> None:
    """The cron.d install must check a marker before overwriting — cron.d
    is a single-file, and unconditionally rewriting it would erase
    operator-added jobs.
    """
    body = INSTALL.read_text(encoding="utf-8")
    m = re.search(r"install_cron\(\)\s*\{(.*?)^\}", body, re.DOTALL | re.MULTILINE)
    assert m, "install.sh: install_cron() function not found"
    cron_section = m.group(1)
    # Marker grep: at least one `grep -q` checking for a sentinel comment.
    assert re.search(r"grep\s+-q\w*\s+", cron_section), (
        "install.sh: cron install must be guarded by a marker grep "
        "so operator-added jobs are not clobbered"
    )


def test_install_systemd_units_guarded() -> None:
    """systemd unit install must NOT unconditionally overwrite — operators
    may have added drop-ins, environment overrides, etc. The same guard
    pattern as the Caddyfile/cron must apply.
    """
    body = INSTALL.read_text(encoding="utf-8")
    m = re.search(r"install_units\(\)\s*\{(.*?)^\}", body, re.DOTALL | re.MULTILINE)
    assert m, "install.sh: install_units() function not found"
    sysd_section = m.group(1)
    # The system must reference both pairly-bot.service and pairly-api.service
    # (either as literals or via a `$unit` variable in a for-loop).
    assert ("pairly-bot.service" in sysd_section
            and "pairly-api.service" in sysd_section), (
        "install.sh: install_units() must reference both pairly-bot.service "
        "and pairly-api.service"
    )
    # Guard pattern: cmp -s, grep -q, or an explicit file test.
    guarded = (
        re.search(r"cmp\s+-s\s+", sysd_section)
        or re.search(r"grep\s+-q\w*\s+", sysd_section)
        or re.search(r"\[\[\s+-f\s+", sysd_section)
    )
    assert guarded, (
        "install.sh: systemd unit install must be guarded (cmp -s / grep -q / "
        "[[ -f ... ]]) so operator drop-ins and edits survive a re-run"
    )


# --- (b) restore.sh lock-safety ---------------------------------------------

def test_restore_detects_active_pairly_services() -> None:
    """restore.sh must look for a running pairly bot/api and refuse to
    run when found. The bot holds the SQLite WAL writer; overwriting the
    .db under it = torn page / SQLITE_CORRUPT.
    """
    body = RESTORE.read_text(encoding="utf-8")
    # Must check `systemctl is-active` for at least one of the units.
    assert re.search(r"systemctl\s+is-active", body), (
        "restore.sh: must call `systemctl is-active` to detect running pairly services"
    )
    # Must check both bare-metal and docker compose paths (operators use
    # one or the other, not both).
    assert re.search(r"pairly-bot", body) or re.search(r"pairly-api", body), (
        "restore.sh: must reference the pairly service names"
    )
    assert re.search(r"docker\s+compose\s+ps", body), (
        "restore.sh: must also check `docker compose ps` for the docker deploy path"
    )


def test_restore_requires_force_or_know_flag() -> None:
    """When pairly services are running, the script must refuse to run
    unless an explicit `--force` or `--i-know-what-im-doing` flag is
    passed (with a corresponding stop+start path).
    """
    body = RESTORE.read_text(encoding="utf-8")
    assert "--force" in body, (
        "restore.sh: must accept a --force flag to override the running-services guard"
    )
    assert "--i-know-what-im-doing" in body, (
        "restore.sh: must accept --i-know-what-im-doing for the auto stop/start path"
    )


def test_restore_uses_sqlite_dot_restore_not_cp() -> None:
    """The old `cp -a $DL_FILE $path` tears the live WAL. The fix is to
    pipe the backup through `sqlite3 $path .timeout 5000` then
    `.restore '$DL_FILE'` — same engine API the backup script uses
    (online-consistent, locks held safely).
    """
    body = RESTORE.read_text(encoding="utf-8")
    # The dangerous `cp -a` must not appear as a real command. The
    # .pre-restore snapshot of a stopped/closed handle may still use
    # `cp -a` — that one is safe, since by the time we reach it the
    # services are stopped. So: the cp -a for $DL_FILE -> $path is the
    # one that must go (that's the live-overwrite path).
    code_lines = "\n".join(line.split("#", 1)[0] for line in body.splitlines())
    assert not re.search(r"\bcp\s+-a\s+\$DL_FILE", code_lines), (
        "restore.sh: `cp -a $DL_FILE $path` tears the live WAL. "
        "Use `sqlite3 $path .timeout 5000` + `.restore '$DL_FILE'`."
    )
    # The new .restore path must be present.
    assert re.search(r'sqlite3\s+"?\$path"?\s+"?\.timeout\s+5000"?', body), (
        "restore.sh: expected `sqlite3 $path .timeout 5000` to acquire the engine lock"
    )
    assert re.search(r"\.restore\s+['\"]?\$DL_FILE", body), (
        "restore.sh: expected `.restore '$DL_FILE'` inside the sqlite3 session"
    )


# --- (c) backup.sh SSE flag -------------------------------------------------

def test_backup_s3_cp_has_sse_flag() -> None:
    """The S3 upload must include an --sse flag. Default is AES256
    (SSE-S3) when PAIRLY_BACKUP_SSE is unset; we expect the shell
    expansion `${PAIRLY_BACKUP_SSE:-AES256}` (or equivalent default).
    """
    body = BACKUP.read_text(encoding="utf-8")
    # The --sse flag must be present in `s3_global_args()` so it ends
    # up in the S3_ARGS array that prefixes `s3 cp` (and `s3 ls`/`s3 rm`).
    m = re.search(r"s3_global_args\(\)\s*\{(.*?)^\}", body, re.DOTALL | re.MULTILINE)
    assert m, "backup.sh: s3_global_args() function not found"
    args_body = m.group(1)
    assert re.search(r"--sse\b", args_body), (
        "backup.sh: s3_global_args() must include an --sse flag"
    )
    # Shell expansion form: dollar-brace PAIRLY_BACKUP_SSE colon-dash AES256 close-brace.
    assert re.search(r"\$\{PAIRLY_BACKUP_SSE:-AES256\}", body), (
        "backup.sh: expected shell expansion `${PAIRLY_BACKUP_SSE:-AES256}` "
        "for the --sse value (SSE-S3 default)"
    )


def test_backup_s3_cp_kms_optional() -> None:
    """When PAIRLY_BACKUP_KMS_KEY_ID is non-empty, --sse-kms-key-id
    must be appended. The check should be guarded by `[[ -n \"$VAR\" ]]`
    so the empty case stays as plain SSE-S3.
    """
    body = BACKUP.read_text(encoding="utf-8")
    assert "PAIRLY_BACKUP_KMS_KEY_ID" in body, (
        "backup.sh: must read PAIRLY_BACKUP_KMS_KEY_ID for KMS support"
    )
    assert re.search(r"--sse-kms-key-id", body), (
        "backup.sh: must append --sse-kms-key-id when KMS is configured"
    )
    # Guarded by a non-empty test on the key id. Accept either
    # `${VAR}` or `${VAR:-}` (the script uses the latter for safety).
    assert re.search(
        r"\[\[\s+-n\s+\"\$\{PAIRLY_BACKUP_KMS_KEY_ID(?::-)?\}\"?\s+\]\]",
        body,
    ), (
        "backup.sh: --sse-kms-key-id must only be appended when "
        "PAIRLY_BACKUP_KMS_KEY_ID is non-empty"
    )


# --- (d) deploy/.env.prod.example docs --------------------------------------

def test_env_example_documents_webhook_secret() -> None:
    body = ENV_EXAMPLE.read_text(encoding="utf-8")
    assert "PAIRLY_WEBHOOK_SECRET_TOKEN" in body, (
        "deploy/.env.prod.example: must document PAIRLY_WEBHOOK_SECRET_TOKEN"
    )


def test_env_example_documents_backup_sse_and_kms() -> None:
    body = ENV_EXAMPLE.read_text(encoding="utf-8")
    assert "PAIRLY_BACKUP_SSE" in body, (
        "deploy/.env.prod.example: must document PAIRLY_BACKUP_SSE (default AES256)"
    )
    assert "PAIRLY_BACKUP_KMS_KEY_ID" in body, (
        "deploy/.env.prod.example: must document PAIRLY_BACKUP_KMS_KEY_ID (KMS mode)"
    )
    # Both SSE-S3 (AES256) and SSE-KMS (aws:kms) options should be mentioned.
    assert "AES256" in body, "deploy/.env.prod.example: must show AES256 default"
    assert "aws:kms" in body, "deploy/.env.prod.example: must show aws:kms option"
