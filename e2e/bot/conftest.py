"""Pytest fixtures for the Pairly bot e2e suite (in-process, no real Telegram).

Mirrors backend/tests/conftest.py: in-memory SQLite + an isolated async session per
test. We set a SMALL free wishlist cap (PAIRLY_FREE_WISHLIST_LIMIT=3) so the
forward->wishlist round-trip test can also exercise the limit branch cheaply.

Run:
    uv run pytest e2e/bot -q
or via:
    make e2e
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

# Force test config BEFORE importing pairly modules.
os.environ.setdefault("PAIRLY_BOT_TOKEN", "0:test")
os.environ["PAIRLY_DATABASE_URL"] = "sqlite+aiosqlite:///:memory:"
# Small cap so the wishlist limit is reachable in a unit-size test.
os.environ.setdefault("PAIRLY_FREE_WISHLIST_LIMIT", "3")


@pytest_asyncio.fixture
async def engine():
    from pairly.db import models  # noqa: F401  (register tables on Base)
    from pairly.db.base import Base

    eng = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )
    async with eng.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield eng
    await eng.dispose()


@pytest_asyncio.fixture
async def session(engine) -> AsyncIterator[AsyncSession]:
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as s:
        yield s


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()
