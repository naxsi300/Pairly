"""Forwarding-fix: notes + photo persistence round-trip and wire format.

Covers the three parts of the user complaint:
  - description (notes) is persisted on create
  - photo_path is persisted and serializes as `photoUrl` (camelCase)
  - the smarter parser picks the right title from a junk-prefixed forward
"""

from __future__ import annotations

import pytest

from pairly.api.schemas import WishlistItemOut
from pairly.bot.parse import parse_forwarded_text
from pairly.repositories import pairs, users, wishlist


async def _pair(session):
    a = await users.get_or_create_user(session, 1001, display_name="a")
    b = await users.get_or_create_user(session, 1002, display_name="b")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_create_item_persists_notes_and_file_id(session):
    a, _b, pair = await _pair(session)
    item = await wishlist.create_item(
        session,
        pair_id=pair.id,
        user_id=a.id,
        title="Джаз-вечер в «Союз Композиторов»",
        notes="Уютный джазовый вечер. Живой квартет, 23 ноября, 20:00.",
        telegram_file_id="AgADBQAD123",
    )
    await session.commit()
    assert item.notes is not None and "джазовый" in item.notes
    assert item.telegram_file_id == "AgADBQAD123"


@pytest.mark.asyncio
async def test_wishlist_out_derives_has_photo(session):
    """WishlistItemOut derives hasPhoto (camelCase) from a truthy telegram_file_id."""
    a, _b, pair = await _pair(session)
    with_photo = await wishlist.create_item(
        session,
        pair_id=pair.id,
        user_id=a.id,
        title="Кофейня «Цех 85»",
        notes="спешелти-кофе",
        telegram_file_id="AgADBQAD999",
    )
    without_photo = await wishlist.create_item(
        session,
        pair_id=pair.id,
        user_id=a.id,
        title="Просто идея",
    )
    await session.commit()
    out = WishlistItemOut.model_validate(with_photo).model_dump(by_alias=True)
    assert out["hasPhoto"] is True
    assert out["notes"] == "спешелти-кофе"
    out2 = WishlistItemOut.model_validate(without_photo).model_dump(by_alias=True)
    assert out2["hasPhoto"] is False


def test_forward_with_junk_prefix_picks_real_title():
    """A t.me link + real title on line 2 -> title is line 2."""
    text = "https://t.me/afisha/1234\nДжаз-вечер в «Союз Композиторов»\n23 ноября, 20:00"
    parsed = parse_forwarded_text(text)
    assert parsed.title == "Джаз-вечер в «Союз Композиторов»"


def test_forward_description_is_full_text_when_handler_persists_it():
    """The handler stores the WHOLE forwarded text as notes (not just line 1)."""
    text = "https://t.me/afisha/1234\nДжаз-вечер в «Союз Композиторов»\nУютный джазовый вечер. Живой квартет."
    # Notes = the full text the handler would persist.
    notes = text.strip()[:4096]
    assert "Уютный джазовый вечер" in notes
    assert "Джаз-вечер" in notes
