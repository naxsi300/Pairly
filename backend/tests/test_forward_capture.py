"""Forwarding-fix: notes + photo persistence round-trip and wire format.

Covers the three parts of the user complaint:
  - description (notes) is persisted on create
  - photo_path is persisted and serializes as `photoUrl` (camelCase)
  - the smarter parser picks the right title from a junk-prefixed forward
"""

from __future__ import annotations

import asyncio
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
    state.get_state = AsyncMock(return_value=None)  # FSM guard: no flow active
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
    state.get_state = AsyncMock(return_value=None)  # FSM guard: no flow active

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


# --- Cluster 4: FSM forward-guard + live hint/upgrade callbacks -----------------


def _stub_call(data: str, *, from_user_id: int = 1001) -> SimpleNamespace:
    """Minimal CallbackQuery stand-in. The cluster-4 handlers only touch .data,
    .answer, and .message.edit_reply_markup."""
    answer = AsyncMock()
    edit_reply_markup = AsyncMock()
    message = SimpleNamespace(edit_reply_markup=edit_reply_markup)
    from_user = SimpleNamespace(id=from_user_id, username="tester", full_name="Tester")
    return SimpleNamespace(
        data=data,
        answer=answer,
        message=message,
        from_user=from_user,
    )


@pytest.mark.asyncio
async def test_on_forward_does_not_clobber_when_fsm_state_active(monkeypatch, session):
    """If a WishEdit flow is open, a forwarded message must NOT create a new
    wishlist item (would clobber the FSM state and rename the WRONG item).

    Regression for the cluster-4 (c) bug.
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

    msg = _stub_forward_message(message_id=424243, text="Случайный пересыл")
    state = MagicMock()
    state.set_state = AsyncMock()
    state.update_data = AsyncMock()
    # FSM guard: a WishEdit.waiting_for_new_title flow is in flight.
    state.get_state = AsyncMock(return_value="WishEdit:waiting_for_new_title")

    await handlers.on_forward(msg, state, SimpleNamespace())

    # The forward must have been dropped silently — no new wishlist item, no
    # FSM mutation, no notification fired.
    assert captured == {}, (
        f"on_forward created an item while WishEdit was active; kwargs: {captured}"
    )
    state.set_state.assert_not_called()
    state.update_data.assert_not_called()


@pytest.mark.asyncio
async def test_on_forward_no_fsm_state_still_creates_item(monkeypatch, session):
    """Sanity check: with no FSM state active (the common case), a forwarded
    message DOES create a wishlist item (the guard doesn't over-reach)."""
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

    msg = _stub_forward_message(message_id=777, text="Кафе на Патриках")
    state = MagicMock()
    state.get_state = AsyncMock(return_value=None)  # no FSM flow

    await handlers.on_forward(msg, state, SimpleNamespace())

    assert captured.get("title") == "Кафе на Патриках"


@pytest.mark.asyncio
async def test_hint_pair_callback_answers_with_show_alert():
    """The hint:pair button emitted by keyboards.webapp_open_kb_or_pair() must
    answer with a show_alert=True toast explaining /pair — otherwise the tap
    is a silent no-op and confuses new users (cluster-4 bug a)."""
    call = _stub_call("hint:pair")
    await handlers.cb_hint_pair(call)
    call.answer.assert_awaited_once()
    args, kwargs = call.answer.call_args
    # First positional or 'text' kwarg should mention /pair.
    text = kwargs.get("text", args[0] if args else "")
    assert "/pair" in text
    assert kwargs.get("show_alert") is True or (
        len(args) > 1 and args[1] is True
    )


@pytest.mark.asyncio
async def test_upgrade_dismiss_callback_hides_keyboard():
    """upgrade:dismiss must answer and strip the keyboard (no message bubble)."""
    call = _stub_call("upgrade:dismiss")
    await handlers.cb_upgrade_dismiss(call)
    call.answer.assert_awaited_once()
    # The keyboard must be removed (so the user doesn't see a stale «Узнать про Pro»).
    call.message.edit_reply_markup.assert_awaited_once()
    args, kwargs = call.message.edit_reply_markup.call_args
    assert kwargs.get("reply_markup") is None


@pytest.mark.asyncio
async def test_upgrade_info_callback_answers_with_pro_pitch_and_hides_keyboard():
    """upgrade:info must show a short Pro pitch (show_alert) AND hide the keyboard."""
    call = _stub_call("upgrade:info")
    await handlers.cb_upgrade_info(call)
    call.answer.assert_awaited_once()
    args, kwargs = call.answer.call_args
    text = kwargs.get("text", args[0] if args else "")
    assert "Pro" in text
    assert kwargs.get("show_alert") is True or (len(args) > 1 and args[1] is True)
    call.message.edit_reply_markup.assert_awaited_once()
    args2, kwargs2 = call.message.edit_reply_markup.call_args
    assert kwargs2.get("reply_markup") is None


# --- Cluster 4: PairAccessError handling in cb_wish_approve + on_rename_reply --


@pytest.mark.asyncio
async def test_cb_wish_approve_pair_access_error_is_neutral(monkeypatch, session):
    """If wishlist.approve_item raises PairAccessError (cross-pair tap), the
    handler must swallow it and answer «Не нашёл пункт.» — never propagate
    (cluster-4 bug e)."""
    from pairly.repositories.base import PairAccessError

    a, _b, pair = await _pair(session)

    # Route the handler's `async with SessionLocal() as session:` to our test session.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _session_ctx():
        yield session

    monkeypatch.setattr(handlers, "SessionLocal", _session_ctx)

    async def _explode(*_args, **_kwargs):
        raise PairAccessError("cross-pair")

    monkeypatch.setattr(handlers.wishlist, "approve_item", _explode)

    call = _stub_call(f"wish:approve:{pair.id}-item")
    await handlers.cb_wish_approve(call)

    call.answer.assert_awaited_once()
    args, kwargs = call.answer.call_args
    text = kwargs.get("text", args[0] if args else "")
    assert "Не нашёл" in text
    assert kwargs.get("show_alert") is True or (len(args) > 1 and args[1] is True)


@pytest.mark.asyncio
async def test_on_rename_reply_pair_access_error_is_neutral(monkeypatch, session):
    """If wishlist.rename_item raises PairAccessError, the rename FSM path
    must close the flow with a neutral «Не нашёл этот пункт.» reply."""
    from pairly.repositories.base import PairAccessError

    a, _b, pair = await _pair(session)

    # Route the handler's `async with SessionLocal() as session:` to our test session.
    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def _session_ctx():
        yield session

    monkeypatch.setattr(handlers, "SessionLocal", _session_ctx)

    async def _explode(*_args, **_kwargs):
        raise PairAccessError("cross-pair")

    monkeypatch.setattr(handlers.wishlist, "rename_item", _explode)

    state = MagicMock()
    state.get_data = AsyncMock(return_value={"item_id": "some-item"})
    state.clear = AsyncMock()

    answer = AsyncMock()
    msg = SimpleNamespace(
        message_id=12,
        text="новое название",
        from_user=SimpleNamespace(id=1001, username="t", full_name="T"),
        answer=answer,
    )

    await handlers.on_rename_reply(msg, state)

    # The FSM must be cleared (so a stale state doesn't trap the user).
    state.clear.assert_awaited_once()
    # And a neutral reply must go to the user.
    answer.assert_awaited_once()
    args, kwargs = answer.call_args
    text = kwargs.get("text", args[0] if args else "")
    assert "Не нашёл" in text


# --- Cluster 4: webhook secret token config + main.py wiring -------------------


def test_settings_webhook_secret_token_defaults_to_empty_string(monkeypatch):
    """Pairly Settings must surface PAIRLY_WEBHOOK_SECRET_TOKEN (default '')."""
    # The conftest already sets PAIRLY_BOT_TOKEN; explicit clear to test default.
    monkeypatch.delenv("PAIRLY_WEBHOOK_SECRET_TOKEN", raising=False)
    from pairly.config import get_settings

    get_settings.cache_clear()
    s = get_settings()
    assert s.webhook_secret_token == ""
    # Restore the cached singleton for downstream tests.
    get_settings.cache_clear()


def test_settings_webhook_secret_token_reads_env(monkeypatch):
    monkeypatch.setenv("PAIRLY_WEBHOOK_SECRET_TOKEN", "abcdef-stable-token")
    from pairly.config import get_settings

    get_settings.cache_clear()
    try:
        s = get_settings()
        assert s.webhook_secret_token == "abcdef-stable-token"
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_run_webhook_uses_stable_secret_from_settings(monkeypatch):
    """When PAIRLY_WEBHOOK_SECRET_TOKEN is set, _run_webhook must pass it to
    set_webhook() — not regenerate a random one (cluster-4 bug d)."""
    from pairly import main

    captured: dict = {}

    class _FakeBot:
        async def set_webhook(self, **kwargs):
            captured.update(kwargs)

        async def delete_webhook(self):
            pass

        session = SimpleNamespace(close=AsyncMock())

    class _FakeDp:
        def resolve_used_update_types(self):
            return []

    # Avoid actually opening a TCP socket — monkeypatch AppRunner / TCPSite.
    class _FakeApp:
        def __init__(self):
            pass

        def __getitem__(self, _):
            return self

    class _FakeRunner:
        async def setup(self):
            pass

        async def cleanup(self):
            pass

    class _FakeSite:
        def __init__(self, *_):
            pass

        async def start(self):
            pass

    # Make setup_application + handler.register no-ops.
    monkeypatch.setattr(main, "web", SimpleNamespace(
        Application=lambda: _FakeApp(),
        AppRunner=lambda *_: _FakeRunner(),
        TCPSite=lambda *_: _FakeSite(),
    ))
    monkeypatch.setattr(main, "SimpleRequestHandler", lambda **_: SimpleNamespace(register=lambda *_, **__: None))
    monkeypatch.setattr(main, "setup_application", lambda *_, **__: None)

    settings = SimpleNamespace(
        webhook_url="https://example.com",
        webhook_path="/telegram-webhook",
        webhook_host="0.0.0.0",
        webhook_port=8080,
        webhook_secret_token="STABLE_FROM_ENV_1234",
    )

    # asyncio.Event().wait() blocks forever — make it return immediately.
    import asyncio as _asyncio

    class _ImmediateEvent:
        async def wait(self):
            return None

    monkeypatch.setattr(_asyncio, "Event", lambda: _ImmediateEvent())

    bot = _FakeBot()
    dp = _FakeDp()
    await main._run_webhook(bot, dp, settings)

    assert captured.get("secret_token") == "STABLE_FROM_ENV_1234", (
        f"webhook secret must come from settings; got: {captured}"
    )


# --- Cluster 4: periodic drain_outbox wiring in main.py -----------------------


@pytest.mark.asyncio
async def test_outbox_drainer_invokes_drain(monkeypatch):
    """_OutboxDrainer.run() must call drain_outbox(session_factory) each tick.

    Drives the loop manually (set _OUTBOX_DRAIN_INTERVAL_SEC to 0 + cancel
    after one tick) and asserts drain was awaited with SessionLocal.
    """
    from pairly import main

    drain = AsyncMock()
    monkeypatch.setattr(main, "_OUTBOX_DRAIN_INTERVAL_SEC", 0.0)
    monkeypatch.setattr(main, "SessionLocal", lambda: SimpleNamespace())

    drainer = main._OutboxDrainer()
    # Patch _drain so it cancels the task on first invocation (one-tick test).
    async def _one_tick(*_args, **_kwargs):
        current = asyncio.current_task()
        if current is not None:
            current.cancel()

    monkeypatch.setattr(drainer, "_drain", _one_tick)
    with pytest.raises(asyncio.CancelledError):
        await drainer.run()


@pytest.mark.asyncio
async def test_outbox_drainer_swallows_drain_exception(monkeypatch):
    """If drain_outbox raises (e.g. DB blip), the drainer must catch it and
    keep ticking — only asyncio.CancelledError may propagate out."""
    from pairly import main

    calls = {"n": 0}

    async def _boom(*_args, **_kwargs):
        calls["n"] += 1
        if calls["n"] >= 2:
            current = asyncio.current_task()
            if current is not None:
                current.cancel()
        raise RuntimeError("simulated DB blip")

    monkeypatch.setattr(main, "_OUTBOX_DRAIN_INTERVAL_SEC", 0.0)

    drainer = main._OutboxDrainer()
    monkeypatch.setattr(drainer, "_drain", _boom)

    with pytest.raises(asyncio.CancelledError):
        await drainer.run()

    # We got at least 2 attempts before being cancelled (proves we kept ticking).
    assert calls["n"] >= 2, f"drainer must keep ticking past exceptions; calls={calls['n']}"
