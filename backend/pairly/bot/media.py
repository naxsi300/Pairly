"""Forwarded-photo capture for wishlist items.

A forwarded post often carries a photo (channel banner, restaurant shot, event
poster). Previously the bot discarded it — the capture loop read only
`message.text / message.caption` and stored no image. This module downloads the
highest-resolution photo attached to a forwarded message and stores it on disk under
a content-addressable path, returning the public URL the Mini App can render.

Storage layout: ``data/wishlist_photos/<sha256>.<ext>``  (content-addressed =>
dedupe of identical photos across forwards; no PII in filenames).
Public URL: ``/media/wishlist/<sha256>.<ext>``  (mounted as StaticFiles in the API).

All failures are best-effort and silent: if Telegram is unreachable or disk is full,
the wishlist item is still created — just without a photo. The title/description are
never gated on photo capture.
"""

from __future__ import annotations

import hashlib
import logging
import re
from pathlib import Path

from aiogram import Bot
from aiogram.types import Message

log = logging.getLogger("pairly.media")

# Public URL prefix the API mounts (StaticFiles at /media/wishlist).
_URL_PREFIX = "/media/wishlist"
_MAX_PHOTO_BYTES = 8 * 1024 * 1024  # 8 MB cap; forwarded channel photos are ~1-2 MB.


def _photo_dir() -> Path:
    """Resolve the on-disk photo directory.

    Default: co-locate with the SQLite DB so the Docker volume persists photos
    next to `pairly.db` (the DB binds to the `pairly-data` volume at /data). An
    explicit PAIRLY_MEDIA_DIR (absolute) overrides everything. The API mounts the
    resolved directory, so both processes always agree.
    """
    settings = None
    try:
        from pairly.config import get_settings

        settings = get_settings()
    except Exception:
        pass
    if settings is not None and settings.media_dir:
        return Path(settings.media_dir)

    # Derive from DATABASE_URL: sqlite+aiosqlite:////data/pairly.db -> /data
    db_url = settings.database_url if settings is not None else ""
    m = re.search(r"sqlite(?:\+\w+)?://(.+)", db_url)
    if m:
        db_path = Path(m.group(1))
        base = db_path.parent if str(db_path.parent) not in ("", ".") else Path(".")
    else:
        base = Path("data")  # Postgres or unknown: local dir, API still serves it.
    return base / "wishlist_photos"


async def download_forwarded_photo(bot: Bot, message: Message) -> str | None:
    """Download the best-resolution photo on a forwarded message.

    Returns the public web URL (``/media/wishlist/<hash>.jpg``) or None if there
    is no photo, the download fails, or the file exceeds the size cap. Never raises.
    """
    if not message.photo:
        return None
    # aiogram gives photo sizes smallest→largest; pick the biggest.
    best = message.photo[-1]

    try:
        file = await bot.get_file(best.file_id)
    except Exception:
        log.warning("get_file failed for forwarded photo", exc_info=True)
        return None

    ext = ".jpg"  # Telegram encodes photos as JPEG.
    digest = hashlib.sha256(best.file_id.encode()).hexdigest()[:32]
    dest_dir = _photo_dir()
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / f"{digest}{ext}"

    if not dest.exists():
        try:
            content = await bot.download_file(file.file_path)
            data = content.read() if hasattr(content, "read") else bytes(content)
        except Exception:
            log.warning("download failed for forwarded photo", exc_info=True)
            return None
        if len(data) > _MAX_PHOTO_BYTES:
            log.info("forwarded photo too large (%d bytes), skipping", len(data))
            return None
        dest.write_bytes(data)
    return f"{_URL_PREFIX}/{digest}{ext}"
