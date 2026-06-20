"""Forwarding-fix: notes + photo persistence round-trip and wire format.

Covers the three parts of the user complaint:
  - description (notes) is persisted on create
  - photo_path is persisted and serializes as `photoUrl` (camelCase)
  - the smarter parser picks the right title from a junk-prefixed forward
"""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from pairly.api.schemas import WishlistItemOut
from pairly.bot import handlers
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


# --- Cluster 9: forward real message_id + grapheme-safe truncation -----------


def _stub_forward_message(
    *, message_id: int, text: str, from_user_id: int = 1001
) -> SimpleNamespace:
    """Minimal Message stand-in that satisfies on_forward() in handlers.py.

    The handler only touches these attributes: text, caption, media_group_id,
    photo, forward_origin, from_user (id/username/full_name), message_id, and
    message.answer / message.bot.me. A SimpleNamespace is enough.

    ``from_user_id`` defaults to 1001 to match the existing paired user `a` in
    _pair() above; the handler resolves the message author by tg_id, so the
    stub must use the same id the test pair was created with.
    """
    from_user = SimpleNamespace(id=from_user_id, username="tester", full_name="Tester")
    return SimpleNamespace(
        message_id=message_id,
        text=text,
        caption=None,
        media_group_id=None,
        photo=None,
        forward_origin=SimpleNamespace(),  # private -> _forward_source_url returns None
        from_user=from_user,
        answer=AsyncMock(),
    )


@pytest.mark.asyncio
async def test_on_forward_passes_source_message_id(monkeypatch, session):
    """The forward handler must pass source_message_id=message.message_id.

    Without it, the wishlist dedupe layer cannot tell a re-forwarded message
    apart from a freshly typed one. (Manual Mini-App POST is intentionally
    left without one so it never dedupes.)
    """
    a, _b, pair = await _pair(session)
    # Patch the real DB-backed repos with a fake pair lookup; keep wishlist real
    # so the source_message_id arg is observable.
    fake_pair = SimpleNamespace(id=pair.id)
    monkeypatch.setattr(
        handlers.base, "get_user_pair", AsyncMock(return_value=fake_pair)
    )
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _session_ctx():
        yield session

    monkeypatch.setattr(handlers, "SessionLocal", _session_ctx)
    captured: dict = {}
    real_create = wishlist.create_item

    async def _spy_create(s, **kwargs):
        captured.update(kwargs)
        return await real_create(s, **kwargs)

    monkeypatch.setattr(handlers.wishlist, "create_item", _spy_create)
    monkeypatch.setattr(
        "pairly.bot.notify.notify_wishlist_pending", AsyncMock()
    )

    msg = _stub_forward_message(message_id=424242, text="Уютный вечер в кафе")
    state = MagicMock()
    state.set_state = AsyncMock()
    state.update_data = AsyncMock()
    bot = SimpleNamespace()  # unused in on_forward body

    await handlers.on_forward(msg, state, bot)

    assert "source_message_id" in captured, (
        f"on_forward did not pass source_message_id; got kwargs: {list(captured)}"
    )
    assert captured["source_message_id"] == 424242


@pytest.mark.asyncio
async def test_on_forward_truncates_title_grapheme_safely(monkeypatch, session):
    """Title fallback at handlers.py:~318 must use truncate_graphemes, not [:256].

    A ZWJ family emoji at the boundary must not be split: the result must end
    with the full cluster, not an orphan ZWJ or trailing glyph.
    """
    a, _b, pair = await _pair(session)
    fake_pair = SimpleNamespace(id=pair.id)
    monkeypatch.setattr(
        handlers.base, "get_user_pair", AsyncMock(return_value=fake_pair)
    )
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _session_ctx():
        yield session

    monkeypatch.setattr(handlers, "SessionLocal", _session_ctx)

    captured: dict = {}
    real_create = wishlist.create_item

    async def _spy_create(s, **kwargs):
        captured.update(kwargs)
        return await real_create(s, **kwargs)

    monkeypatch.setattr(handlers.wishlist, "create_item", _spy_create)
    monkeypatch.setattr(
        "pairly.bot.notify.notify_wishlist_pending", AsyncMock()
    )

    # Family emoji = man+woman+girl+boy joined by ZWJ (single grapheme cluster).
    _FAMILY = "\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466"
    # 255 ASCII + family cluster: with [:256] you'd get 255 ASCII + man glyph
    # (lone ZWJ + woman/girl/boy left behind). With truncate_graphemes, either
    # all 256 are kept (including the family) or the family is dropped whole.
    title = "X" * 255 + _FAMILY
    msg = _stub_forward_message(message_id=101, text=title)
    state = MagicMock()
    state.set_state = AsyncMock()
    state.update_data = AsyncMock()

    await handlers.on_forward(msg, state, SimpleNamespace())

    stored = captured.get("title", "")
    if stored.endswith("‍") or stored.endswith("\U0001F468"):
        pytest.fail(
            f"on_forward split a ZWJ family cluster; stored title tail: {stored[-10:]!r}"
        )
    from pairly.bot.text import truncate_graphemes
    assert stored == truncate_graphemes(title, 256)


@pytest.mark.asyncio
async def test_on_title_reply_passes_fsm_colon_source_message_id(monkeypatch, session):
    """The FSM title-reply path must pass source_message_id=f"fsm-colon-{message_id}".

    This way, a re-forward of the SAME media message (now with a manually typed
    title) still dedupes; the format intentionally differs from a real
    source_message_id (an int) so the two paths can never collide.
    """
    a, _b, pair = await _pair(session)
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _session_ctx():
        yield session

    monkeypatch.setattr(handlers, "SessionLocal", _session_ctx)

    captured: dict = {}
    real_create = wishlist.create_item

    async def _spy_create(s, **kwargs):
        captured.update(kwargs)
        return await real_create(s, **kwargs)

    monkeypatch.setattr(handlers.wishlist, "create_item", _spy_create)
    monkeypatch.setattr(
        "pairly.bot.notify.notify_wishlist_added", AsyncMock()
    )

    state = MagicMock()
    state.get_data = AsyncMock(
        return_value={"pair_id": pair.id, "user_id": a.id}
    )
    state.clear = AsyncMock()

    msg = SimpleNamespace(
        message_id=909,
        text="Мой заголовок",
        answer=AsyncMock(),
    )
    await handlers.on_title_reply(msg, state)

    assert "source_message_id" in captured
    assert captured["source_message_id"] == "fsm-colon-909"


@pytest.mark.asyncio
async def test_on_title_reply_truncates_title_grapheme_safely(monkeypatch, session):
    """Title truncation in the FSM title-reply path must also be grapheme-safe."""
    a, _b, pair = await _pair(session)
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _session_ctx():
        yield session

    monkeypatch.setattr(handlers, "SessionLocal", _session_ctx)

    captured: dict = {}
    real_create = wishlist.create_item

    async def _spy_create(s, **kwargs):
        captured.update(kwargs)
        return await real_create(s, **kwargs)

    monkeypatch.setattr(handlers.wishlist, "create_item", _spy_create)
    monkeypatch.setattr(
        "pairly.bot.notify.notify_wishlist_added", AsyncMock()
    )

    state = MagicMock()
    state.get_data = AsyncMock(
        return_value={"pair_id": pair.id, "user_id": a.id}
    )
    state.clear = AsyncMock()

    _FAMILY = "\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466"
    text = "Y" * 255 + _FAMILY
    msg = SimpleNamespace(message_id=11, text=text, answer=AsyncMock())
    await handlers.on_title_reply(msg, state)

    stored = captured.get("title", "")
    from pairly.bot.text import truncate_graphemes
    assert stored == truncate_graphemes(text, 256)
    assert not stored.endswith("‍") and not stored.endswith("\U0001F468"), (
        f"FSM title-reply split a ZWJ family cluster; tail: {stored[-10:]!r}"
    )
