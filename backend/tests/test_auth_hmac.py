"""Telegram initData HMAC validation — auth security test.

Covers: valid signature accepted, bad signature rejected, expired auth_date rejected,
missing fields rejected, replay window.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time
from urllib.parse import urlencode

import pytest
from pairly.auth import validate_init_data


def _make_init_data(bot_token: str, *, user_id: int, auth_date: int | None = None) -> str:
    """Build a valid initData string signed with the given bot token."""
    auth_date = auth_date if auth_date is not None else int(time.time())
    user = json.dumps({"id": user_id, "username": "alice", "first_name": "Alice"}, separators=(",", ":"))
    params = {
        "user": user,
        "auth_date": str(auth_date),
        "query_id": "AAH123",
    }
    # Build check string: sort by key, exclude 'hash'.
    pairs = sorted((k, v) for k, v in params.items() if k != "hash")
    check_string = "\n".join(f"{k}={v}" for k, v in pairs)
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    params["hash"] = hmac.new(secret, check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(params)


BOT_TOKEN = "test-bot-token-123"


def test_valid_signature_accepted():
    init = _make_init_data(BOT_TOKEN, user_id=42)
    parsed = validate_init_data(init, bot_token=BOT_TOKEN)
    assert parsed["user"]["id"] == 42
    assert parsed["user"]["username"] == "alice"


def test_bad_signature_rejected():
    init = _make_init_data(BOT_TOKEN, user_id=42)
    # Tamper with user_id — hash no longer matches.
    from urllib.parse import parse_qs, urlencode

    parsed = parse_qs(init, keep_blank_values=True)
    parsed["user"] = [json.dumps({"id": 99, "username": "evil", "first_name": "E"})]
    tampered = urlencode({k: v[0] for k, v in parsed.items()})
    with pytest.raises(Exception) as ei:
        validate_init_data(tampered, bot_token=BOT_TOKEN)
    assert "bad signature" in str(ei.value)


def test_wrong_bot_token_rejected():
    """A signature valid for one bot token must not validate against another."""
    init = _make_init_data(BOT_TOKEN, user_id=42)
    with pytest.raises(Exception) as ei:
        validate_init_data(init, bot_token="different-token")
    assert "bad signature" in str(ei.value)


def test_expired_auth_date_rejected():
    # 25 hours old.
    old_ts = int(time.time()) - 25 * 3600
    init = _make_init_data(BOT_TOKEN, user_id=42, auth_date=old_ts)
    with pytest.raises(Exception) as ei:
        validate_init_data(init, bot_token=BOT_TOKEN)
    assert "auth_date too old" in str(ei.value)


def test_empty_init_data_rejected():
    with pytest.raises(Exception) as ei:
        validate_init_data("", bot_token=BOT_TOKEN)
    assert "missing initData" in str(ei.value)


def test_missing_hash_rejected():
    from urllib.parse import urlencode

    bad = urlencode({"user": json.dumps({"id": 1}), "auth_date": str(int(time.time()))})
    with pytest.raises(Exception) as ei:
        validate_init_data(bad, bot_token=BOT_TOKEN)
    assert "missing hash" in str(ei.value)
