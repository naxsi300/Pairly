"""Seed CLI — populate the QOTD bank. Idempotent.

Run: `make seed` (or `uv run python -m pairly.db.seed`).
"""

from __future__ import annotations

import asyncio

from pairly.db.base import SessionLocal, init_db
from pairly.db.seed_data import seed


async def main() -> None:
    await init_db()
    async with SessionLocal() as session:
        counts = await seed(session)
        await session.commit()
    print(f"Seed done: +{counts['qotd_added']} QOTD questions "
          f"(catalog has {counts['gift_catalog']} gestures).")


if __name__ == "__main__":
    asyncio.run(main())
