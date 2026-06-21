"""Pytest fixtures: isolated async session per test, schema from real alembic migrations.

The app's `engine`/`SessionLocal` are created at import time from
`get_settings().database_url`. We never use them in tests — every test gets a
fresh per-test async engine bound to a unique temp-file SQLite URL, with the
schema installed by running `alembic upgrade head` against that URL. This
ensures the migration chain IS the schema tests run against (the earlier
`Base.metadata.create_all` approach let a Postgres-only deploy blocker ship,
because nothing exercised alembic during the suite).
"""

from __future__ import annotations

import asyncio
import os
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Force test config BEFORE importing pairly modules.
os.environ.setdefault("PAIRLY_BOT_TOKEN", "0:test")
os.environ.setdefault("PAIRLY_FREE_WISHLIST_LIMIT", "3")  # small cap for limit tests

# Repo root for resolving the migrations directory regardless of cwd.
_REPO_ROOT = Path(__file__).resolve().parents[2]
_MIGRATIONS_DIR = str((_REPO_ROOT / "backend" / "pairly" / "migrations").resolve())
_ALEMBIC_INI = str((_REPO_ROOT / "backend" / "pairly" / "migrations" / "alembic.ini").resolve())


def _alembic_upgrade(url: str) -> None:
    """Run alembic upgrade head against an async-URL SQLite DB.

    env.py always overrides sqlalchemy.url with get_settings().database_url, so we
    set the env var (NOT the Config) — env.py picks it up and runs migrations
    against our temp file.
    """
    os.environ["PAIRLY_DATABASE_URL"] = url
    # Import lazily so the test process picks up the fresh env var on the
    # first call. lru_cache on get_settings() means subsequent calls reuse
    # the SAME Settings() instance — so we bust the cache here so each test's
    # URL wins. (env.py is re-executed per upgrade call, but only reads from
    # the cached settings.)
    from pairly.config import get_settings

    get_settings.cache_clear()

    from alembic.command import upgrade as alembic_upgrade
    from alembic.config import Config

    cfg = Config(_ALEMBIC_INI)
    cfg.set_main_option("script_location", _MIGRATIONS_DIR)
    # Don't let env.py fileConfig() the root logger — that attaches a stderr
    # handler to root and breaks pytest's caplog propagation for OTHER loggers
    # (notably pairly.*) in tests that follow.
    cfg.config_file_name = None
    alembic_upgrade(cfg, "head")


async def _alembic_upgrade_async(url: str) -> None:
    """Async wrapper: alembic.command.upgrade calls asyncio.run() internally, which
    raises inside our running event loop — so we offload to a worker thread.
    """
    await asyncio.to_thread(_alembic_upgrade, url)


@pytest_asyncio.fixture
async def engine():
    # Per-test temp file so migrations + schema are scoped to one test.
    fd, path = tempfile.mkstemp(prefix="pairly_test_", suffix=".db")
    os.close(fd)
    db_path = f"sqlite+aiosqlite:///{path}"

    # alembic.command.upgrade calls asyncio.run() internally; under pytest-asyncio
    # we're already in a running loop, so we offload to a thread.
    await _alembic_upgrade_async(db_path)

    eng = create_async_engine(
        db_path,
        connect_args={"check_same_thread": False},
    )
    try:
        yield eng
    finally:
        await eng.dispose()
        # Clean up the temp file so /tmp doesn't grow during CI runs.
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


@pytest_asyncio.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        # Seed a couple of QOTD questions so qotd.todays_question() returns one.
        from pairly.db.models import QOTDQuestion

        for txt in ("Что тебя сегодня порадовало?", "Куда бы мы поехали прямо сейчас?"):
            s.add(QOTDQuestion(text=txt, category="благодарность", is_active=True))
        await s.commit()
        yield s


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()