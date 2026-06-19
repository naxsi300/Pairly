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
from pathlib import Path

from aiogram import Bot
from aiogram.types import Message

log = logging.getLogger("pairly.media")

# Content-addressed photo storage. Relative to the process CWD; the API mounts the
# same directory (see pairly.api.app create_app → StaticFiles mount).
_PHOTO_DIR = Path("data/wishlist_photos")
_URL_PREFIX = "/media/wishlist"
_MAX_PHOTO_BYTES = 8 * 1024 * 1024  # 8 MB cap; forwarded channel photos are ~1-2 MB.


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
    dest_dir = _PHOTO_DIR
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
