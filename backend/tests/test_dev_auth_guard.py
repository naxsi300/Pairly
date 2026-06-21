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


# --- Cluster 5 (f): the env's api_host is bypassable when the docker entrypoint
# forces --host 0.0.0.0. The guard must ALSO refuse dev_auth when api_deploy ==
# "docker" (cluster 10 sets PAIRLY_API_DEPLOY=docker in the entrypoint).
# `create_app` is called at import time (module bottom), so the docker case has
# to be checked before that import. We use a subprocess so the cached `app`
# singleton doesn't mask the boot guard. ---


def test_dev_auth_docker_deploy_raises_subprocess(tmp_path):
    """When api_deploy='docker' the guard must refuse dev_auth even if api_host
    is loopback. The docker entrypoint overrides --host at runtime, so checking
    api_host alone is bypassable; checking api_deploy closes the hole."""
    import os
    import subprocess
    import sys

    script = (
        "import os, sys\n"
        "os.environ['PAIRLY_BOT_TOKEN'] = '0:test'\n"
        "os.environ['PAIRLY_API_DEPLOY'] = 'docker'\n"
        "os.environ['PAIRLY_DEV_AUTH'] = '1'\n"
        "os.environ['PAIRLY_API_HOST'] = '127.0.0.1'  # would pass the old guard\n"
        "os.environ['PAIRLY_DATABASE_URL'] = 'sqlite+aiosqlite:///:memory:'\n"
        # Bypass lru_cache so each subprocess gets fresh settings.
        "from pairly.config import get_settings\n"
        "get_settings.cache_clear()\n"
        "try:\n"
        "    from pairly.api.app import create_app\n"
        "    create_app()\n"
        "except RuntimeError as e:\n"
        "    print('GUARD_RAISED:', e); sys.exit(0)\n"
        "print('GUARD_BYPASSED'); sys.exit(2)\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", script],
        capture_output=True,
        text=True,
        # Derive the backend dir from this test file's location so the test is
        # portable (the hardcoded absolute path failed in CI with PermissionError).
        cwd=os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    )
    assert "GUARD_RAISED" in result.stdout, (
        f"expected guard to raise on docker+dev_auth. stdout={result.stdout!r} "
        f"stderr={result.stderr!r} rc={result.returncode}"
    )
