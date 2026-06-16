"""Pytest fixtures: in-memory SQLite, isolated async session per test.

We override the app's engine/SessionLocal for tests so the app code under test
(repositories import SessionLocal indirectly only where handlers do; repos take a session
arg) operates against the in-memory DB.
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
os.environ.setdefault("PAIRLY_FREE_WISHLIST_LIMIT", "3")  # small cap for limit tests


@pytest_asyncio.fixture
async def engine():
    from pairly.db import models  # noqa: F401
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
