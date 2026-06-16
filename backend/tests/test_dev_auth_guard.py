"""Boot guard: PAIRLY_DEV_AUTH=1 must refuse to run on a public bind.

Dev-auth is a full unauthenticated impersonation of any user (X-Dev-User-Id), so
it can only be safe on a loopback bind. The guard fires at create_app() time.
"""

from __future__ import annotations

import pytest
from pairly.api.app import create_app
from pairly.config import get_settings


def test_dev_auth_on_loopback_is_allowed(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "dev_auth", True, raising=False)
    monkeypatch.setattr(s, "api_host", "127.0.0.1", raising=False)
    app = create_app()  # must not raise
    assert app is not None


def test_dev_auth_on_public_bind_raises(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "dev_auth", True, raising=False)
    monkeypatch.setattr(s, "api_host", "0.0.0.0", raising=False)
    with pytest.raises(RuntimeError, match="public bind"):
        create_app()


def test_dev_auth_disabled_on_public_bind_is_fine(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "dev_auth", False, raising=False)
    monkeypatch.setattr(s, "api_host", "0.0.0.0", raising=False)
    app = create_app()  # prod mode on a public bind is the normal case
    assert app is not None
