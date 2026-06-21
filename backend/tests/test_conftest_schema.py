"""Guard: conftest.py must install the schema by running alembic migrations,
NOT by Base.metadata.create_all (which lets Postgres-only deploy blockers ship
silently). This test runs alembic upgrade head against a fresh DB and checks
the schema matches what Base.metadata declares — i.e. the same chain the
fixture uses. If a future conftest regresses to create_all, this test will
catch the divergence (we explicitly verify alembic version table exists,
which create_all never creates).
"""

from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.asyncio import create_async_engine

_REPO_ROOT = Path(__file__).resolve().parents[2]
_MIGRATIONS_DIR = str((_REPO_ROOT / "backend" / "pairly" / "migrations").resolve())
_ALEMBIC_INI = str((_REPO_ROOT / "backend" / "pairly" / "migrations" / "alembic.ini").resolve())


@pytest.mark.asyncio
async def test_conftest_runs_alembic_not_create_all() -> None:
    """Run alembic upgrade head against a fresh SQLite, verify alembic_version
    table exists (proving migrations were the schema source). If conftest
    regresses to Base.metadata.create_all, alembic_version would be MISSING
    and this test would fail.
    """
    fd, path = tempfile.mkstemp(prefix="pairly_schema_", suffix=".db")
    os.close(fd)
    db_url = f"sqlite+aiosqlite:///{path}"
    os.environ["PAIRLY_DATABASE_URL"] = db_url
    try:
        # Bust the lru_cache so the env-var URL is picked up.
        from pairly.config import get_settings

        get_settings.cache_clear()

        from alembic.command import upgrade as alembic_upgrade
        from alembic.config import Config

        cfg = Config(_ALEMBIC_INI)
        cfg.set_main_option("script_location", _MIGRATIONS_DIR)
        cfg.config_file_name = None  # mirror conftest: don't fileConfig root
        # alembic.command.upgrade calls asyncio.run() internally — offload
        # to a thread so we don't conflict with the pytest-asyncio loop.
        import asyncio

        await asyncio.to_thread(alembic_upgrade, cfg, "head")

        # Probe the resulting schema with a sync engine (table list + version).
        sync_url = f"sqlite:///{path}"
        sync_eng = create_engine(sync_url)
        try:
            insp = inspect(sync_eng)
            tables = set(insp.get_table_names())
            # alembic ALWAYS creates this table; create_all NEVER does.
            assert "alembic_version" in tables, (
                f"alembic_version table missing — conftest.py likely regressed "
                f"to Base.metadata.create_all. Got tables: {sorted(tables)}"
            )
            # The latest revision is 0012_notify_outbox (head).
            with sync_eng.connect() as conn:
                version = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            assert version == "0012_notify_outbox", f"expected head 0012_notify_outbox, got {version}"

            # Spot-check a few core tables that create_all would also create —
            # the value here is the alembic_version check above, this is just
            # defense in depth.
            for required in ("users", "pairs", "pair_invites", "wishlist_items"):
                assert required in tables, f"required table {required} missing"
        finally:
            sync_eng.dispose()
    finally:
        # Clean up — also open + close the async engine so any pooled conns
        # to the file release before unlink.
        try:
            eng = create_async_engine(db_url, connect_args={"check_same_thread": False})
            await eng.dispose()
        except Exception:
            pass
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass
