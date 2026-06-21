"""Cluster 8: Caddy hardening static checks.

We don't have the caddy binary in CI, so we lint the Caddyfile(s) statically:
the asserts below correspond to the four contract points in the cluster
spec — log redaction, dev-header stripping, request body cap, rate limit
intentionality. Each test reads the file from disk fresh; the expected
strings are the Caddy directives documented in
https://caddyserver.com/docs/caddyfile/directives/{log,reverse_proxy,request_body}
so a refactor that breaks them is caught here.

Both Caddyfiles (bare-metal + docker) must satisfy the same checks, with
the one docker-only exception of the :80 health endpoint and webhook
reverse_proxy.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
DEPLOY = REPO / "deploy" / "caddy"

# Which Caddyfiles are in scope. Add more here when new variants land.
CADDYFILES = [
    DEPLOY / "Caddyfile",
    DEPLOY / "Caddyfile.docker",
]


@pytest.fixture(params=[p.name for p in CADDYFILES], ids=lambda n: n)
def caddyfile_path(request) -> Path:
    p = DEPLOY / request.param
    if not p.exists():
        pytest.skip(f"{p} not present")
    return p


def _read(path: Path) -> str:
    return path.read_text(encoding="utf-8")


# --- (a) log redaction -------------------------------------------------------

def test_log_redacts_init_data_query(caddyfile_path: Path) -> None:
    """`/api/wishlist/*/photo` accepts init_data + dev_user_id as query params.

    Caddy's default `console` log format includes the full request URI, so
    the captured 24h-replayable initData and dev impersonation id would
    land in /var/log/caddy/*.log. We must use the filter format with
    `request>uri query { replace ... REDACTED }`.
    """
    body = _read(caddyfile_path)
    assert "format filter" in body, (
        f"{caddyfile_path.name}: expected `format filter` log directive "
        "to redact sensitive query params"
    )
    # Must target the URI/query field — that's where the query string lives.
    assert re.search(r"request>uri\s+query\s*\{", body), (
        f"{caddyfile_path.name}: expected `request>uri query {{ ... }}` block"
    )
    # Must redact BOTH keys (the photo endpoint reads both from query string).
    init_redact = re.search(
        r"query\s*\{[^}]*replace\s+init_data\s+\S+", body, re.DOTALL
    )
    dev_redact = re.search(
        r"query\s*\{[^}]*replace\s+dev_user_id\s+\S+", body, re.DOTALL
    )
    assert init_redact, f"{caddyfile_path.name}: init_data query redaction missing"
    assert dev_redact, f"{caddyfile_path.name}: dev_user_id query redaction missing"


# --- (b) reverse_proxy header stripping -------------------------------------

def test_strips_dev_user_id_header_on_api_proxy(caddyfile_path: Path) -> None:
    """`header_up -X-Dev-User-Id` on the @api reverse_proxy block.

    External callers MUST NOT be able to spoof the dev impersonation
    header and ride past auth as any user. The legit header from the
    Telegram Mini App client is `X-Telegram-Init-Data` — that one stays.
    """
    body = _read(caddyfile_path)
    assert re.search(r"header_up\s+-X-Dev-User-Id", body), (
        f"{caddyfile_path.name}: missing `header_up -X-Dev-User-Id` on the "
        "API reverse_proxy — this is the dev-auth spoof vector"
    )


def test_does_not_strip_legit_telegram_init_data_header(caddyfile_path: Path) -> None:
    """The legit Mini App header `X-Telegram-Init-Data` MUST survive the proxy.

    The Mini App client sends `X-Telegram-Init-Data` on every request;
    stripping it would break auth for every real user.
    """
    body = _read(caddyfile_path)
    # `-X-Telegram-Init-Data` is a Caddy "delete this header" — must NOT appear.
    assert not re.search(r"header_up\s+-X-Telegram-Init-Data", body), (
        f"{caddyfile_path.name}: `X-Telegram-Init-Data` is the LEGIT Mini App "
        "auth header — stripping it would break every real request"
    )


# --- (c) request body cap ----------------------------------------------------

def test_request_body_cap_is_set(caddyfile_path: Path) -> None:
    """`request_body { max_size ... }` directive present, with a sane cap.

    The app-side limiter from cluster 5 is the primary defense; this is
    the Caddy-layer hard cap that prevents an oversized body from even
    reaching the app. 1 MiB is well above our largest legit payload
    (photo upload <512 KiB) and well below any DoS.
    """
    body = _read(caddyfile_path)
    m = re.search(r"request_body\s*\{[^}]*max_size\s+(\d+)\s*([KMG]?B)", body, re.DOTALL)
    assert m, (
        f"{caddyfile_path.name}: missing `request_body {{ max_size ... }}`"
    )
    # Parse to bytes and assert it's in a sane range (>= 256 KiB, <= 16 MiB).
    num = int(m.group(1))
    unit = m.group(2)
    mult = {"B": 1, "KB": 1024, "MB": 1024 * 1024, "GB": 1024 ** 3}[unit]
    bytes_cap = num * mult
    assert 256 * 1024 <= bytes_cap <= 16 * 1024 * 1024, (
        f"{caddyfile_path.name}: body cap {bytes_cap} bytes is outside sane range"
    )


# --- (d) rate limit ----------------------------------------------------------

def test_rate_limit_intentionality(caddyfile_path: Path) -> None:
    """Caddy rate_limit is a plugin (mholt/caddy-ratelimit) — not in stock
    caddy:2-alpine / apt's caddy. We either wire the directive (if the
    custom build has the plugin) OR leave an explicit TODO.

    Either is acceptable; the test passes if at least one is present so
    that downstream audits can see the operator made a deliberate choice
    rather than forgetting about it.
    """
    body = _read(caddyfile_path)
    has_directive = bool(re.search(r"\brate_limit\b", body))
    has_todo = bool(re.search(r"TODO.*rate[_ -]?limit", body, re.IGNORECASE))
    assert has_directive or has_todo, (
        f"{caddyfile_path.name}: no rate_limit directive AND no TODO — "
        "pick one. The app-side limiter is the primary defense, but a "
        "coarse /api/* limit at the edge is cheap belt-and-suspenders."
    )


# --- bonus: API proxy must be present (regression) ---------------------------

def test_api_reverse_proxy_present(caddyfile_path: Path) -> None:
    """Regression guard: the @api reverse_proxy block must still exist.

    Catches a botched refactor that drops the API routing entirely.
    """
    body = _read(caddyfile_path)
    assert re.search(r"reverse_proxy\s+\S+:\d+", body), (
        f"{caddyfile_path.name}: no reverse_proxy upstream found"
    )
