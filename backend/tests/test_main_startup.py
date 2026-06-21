"""main() startup: init_db must be gated on DEBUG (alembic is the prod source of truth).

Regression test for the bug where main() called init_db() (Base.metadata.create_all)
unconditionally on every boot — including prod — which undermines alembic and can
silently mask a missing migration (the 0006 Postgres blocker shipped this way).
"""

from __future__ import annotations

import pytest


class _FakeSettings:
    def __init__(self, debug: bool) -> None:
        self.debug = debug


@pytest.mark.asyncio
async def test_init_db_skipped_when_debug_off(monkeypatch):
    import pairly.main as main_mod

    calls: list[int] = []

    async def _fake_init() -> None:
        calls.append(1)

    monkeypatch.setattr(main_mod, "init_db", _fake_init)
    await main_mod._maybe_init_db(_FakeSettings(debug=False))
    assert calls == [], "init_db must NOT run when debug is off (prod path)"


@pytest.mark.asyncio
async def test_init_db_runs_when_debug_on(monkeypatch):
    import pairly.main as main_mod

    calls: list[int] = []

    async def _fake_init() -> None:
        calls.append(1)

    monkeypatch.setattr(main_mod, "init_db", _fake_init)
    await main_mod._maybe_init_db(_FakeSettings(debug=True))
    assert calls == [1], "init_db SHOULD run in dev (debug on)"
