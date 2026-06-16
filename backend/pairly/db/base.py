"""Async SQLAlchemy 2.0 engine, session, and declarative base.

Engine is chosen from the `DATABASE_URL` scheme: aiosqlite for dev, asyncpg for prod.
"""

from __future__ import annotations

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase

from pairly.config import get_settings


def _engine_kwargs(url: str) -> dict:
    """SQLite needs check_same_thread=False under aiosqlite; others are default."""
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    return {}


settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    **_engine_kwargs(settings.database_url),
)

SessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Declarative base for all models."""


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency: yields a session, rolls back on error."""
    async with SessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db() -> None:
    """Create all tables. Dev convenience only — migrations are the real source of truth."""
    from pairly.db import models  # noqa: F401  (register models on Base)

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
