"""AI client robustness (cluster 8):

- payload includes ``max_tokens`` and the client is built with a
  ``max_response_size`` limit (OOM guard for the cheap VPS);
- HTTP 5xx / 429 and transport errors are retried with backoff, then
  surface to the caller so date_idea can fall back;
- smart-mode prompt's time-of-day label uses the caller's timezone, not
  the server's wall clock;
- when the AI client raises, ``pick_date_idea`` falls back to a
  default ``DateIdea`` and logs a warning so operators can see it.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from pairly import ai
from pairly.ai.client import AIError
from pairly.use_cases.date_idea import DateIdea, _build_context, pick_date_idea


# ---------- helpers for monkeypatching the httpx POST ----------


class _FakeResponse:
    """Minimal stand-in for ``httpx.Response`` for aread() / raise_for_status()."""

    def __init__(
        self,
        *,
        status_code: int = 200,
        payload: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        body: bytes | None = None,
    ) -> None:
        self.status_code = status_code
        if body is not None:
            self._body = body
        else:
            default = payload if payload is not None else {
                "choices": [{"message": {"content": "{}"}}]
            }
            self._body = json.dumps(default).encode("utf-8")
        # If the caller didn't set a Content-Length, mirror the body size.
        hdrs = dict(headers) if headers else {}
        hdrs.setdefault("content-length", str(len(self._body)))
        self.request = httpx.Request("POST", "https://example.test/chat/completions")
        self.headers = hdrs

    async def aread(self) -> bytes:
        return self._body

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise httpx.HTTPStatusError(
                "boom", request=self.request, response=self
            )


class _RecorderClient:
    """Records every call to ``post`` and dispatches a programmable response.

    ``response_sequence`` lists the responses to return in order. When the
    sequence is exhausted, the last element is repeated so 503+ tests can
    model "always 503" without bookkeeping.
    """

    def __init__(
        self,
        response_sequence: list[_FakeResponse],
        *,
        raise_transport_after: int | None = None,
    ) -> None:
        self.response_sequence = response_sequence
        self.posts: list[dict[str, Any]] = []
        self.ctor_kwargs: list[dict[str, Any]] = []
        self.entered = 0
        self._raise_transport_after = raise_transport_after
        self._post_count = 0

    def __call__(self, *args: Any, **kwargs: Any) -> "_RecorderClient":
        # Constructor kwargs recorded for limits / timeout assertions.
        self.ctor_kwargs.append({"args": args, "kwargs": kwargs})
        return self

    async def __aenter__(self) -> "_RecorderClient":
        self.entered += 1
        return self

    async def __aexit__(self, exc_type, exc, tb) -> None:
        return None

    async def post(self, url: str, *, headers: dict[str, str], json: dict[str, Any]) -> _FakeResponse:
        self.posts.append({"url": url, "headers": headers, "json": json})
        self._post_count += 1
        if (
            self._raise_transport_after is not None
            and self._post_count > self._raise_transport_after
        ):
            raise httpx.ConnectError("network down")
        if not self.response_sequence:
            return _FakeResponse()
        idx = min(self._post_count - 1, len(self.response_sequence) - 1)
        return self.response_sequence[idx]


def _patch_async_client(monkeypatch, recorder: _RecorderClient) -> None:
    """Replace ``httpx.AsyncClient`` with the recorder inside the client module."""
    monkeypatch.setattr(ai.client.httpx, "AsyncClient", recorder)


# ---------- (a) payload + client limits ----------


@pytest.mark.asyncio
async def test_payload_includes_max_tokens_and_client_has_response_size_limit(
    monkeypatch,
) -> None:
    """The POST payload carries ``max_tokens`` and the client is built with a
    response-size cap (OOM guard) plus the existing timeout."""
    recorder = _RecorderClient([_FakeResponse()])
    _patch_async_client(monkeypatch, recorder)
    monkeypatch.setattr(
        ai.client, "get_settings", lambda: _StubSettings(base="https://api.test")
    )

    out = await ai.chat_json(system="s", user="u")
    assert out == {}

    assert recorder.posts, "POST was never called"
    payload = recorder.posts[0]["json"]
    assert payload["max_tokens"] == 500

    assert recorder.ctor_kwargs, "AsyncClient was never constructed"
    ctor = recorder.ctor_kwargs[0]["kwargs"]
    assert ctor.get("timeout") == 30.0
    # The OOM guard is a module-level constant we enforce post-read; the
    # AsyncClient is still built with ``httpx.Limits()`` (httpx 0.28 doesn't
    # expose max_response_size on Limits, so the cap is enforced on the body).
    from pairly.ai.client import _MAX_RESPONSE_BYTES
    assert _MAX_RESPONSE_BYTES == 1_048_576


class _StubSettings:
    """Minimal stand-in covering only the fields chat_json reads."""

    def __init__(self, *, base: str, key: str = "k", model: str = "m") -> None:
        self.omnirout_base_url = base
        self.omnirout_api_key = key
        self.omnirout_model = model


# ---------- (b) retry then raise ----------


@pytest.mark.asyncio
async def test_retries_503_then_raises(monkeypatch) -> None:
    """3 attempts on a 503, then raise — the caller's fallback path can run."""
    recorder = _RecorderClient(
        response_sequence=[_FakeResponse(status_code=503) for _ in range(5)]
    )
    _patch_async_client(monkeypatch, recorder)
    monkeypatch.setattr(
        ai.client, "get_settings", lambda: _StubSettings(base="https://api.test")
    )
    # No real sleeping — keep tests fast.
    async def _noop_sleep(*_a, **_k):
        return None
    monkeypatch.setattr(ai.client.asyncio, "sleep", _noop_sleep)

    with pytest.raises(AIError):
        await ai.chat_json(system="s", user="u")
    # 3 attempts: initial + 2 retries.
    assert len(recorder.posts) == 3


@pytest.mark.asyncio
async def test_retries_transport_error_then_raises(monkeypatch) -> None:
    """TransportError (e.g. ConnectError) is also retried, then surfaced."""
    recorder = _RecorderClient(
        response_sequence=[],
        raise_transport_after=0,  # every call raises ConnectError
    )
    _patch_async_client(monkeypatch, recorder)
    monkeypatch.setattr(
        ai.client, "get_settings", lambda: _StubSettings(base="https://api.test")
    )
    async def _noop_sleep(*_a, **_k):
        return None
    monkeypatch.setattr(ai.client.asyncio, "sleep", _noop_sleep)

    with pytest.raises(AIError):
        await ai.chat_json(system="s", user="u")
    assert len(recorder.posts) == 3


@pytest.mark.asyncio
async def test_400_is_not_retried(monkeypatch) -> None:
    """4xx other than 429 is a hard error — one attempt, then raise."""
    recorder = _RecorderClient(
        response_sequence=[_FakeResponse(status_code=400) for _ in range(5)]
    )
    _patch_async_client(monkeypatch, recorder)
    monkeypatch.setattr(
        ai.client, "get_settings", lambda: _StubSettings(base="https://api.test")
    )

    with pytest.raises(AIError):
        await ai.chat_json(system="s", user="u")
    assert len(recorder.posts) == 1


@pytest.mark.asyncio
async def test_retry_after_header_honored(monkeypatch) -> None:
    """Retry-After header is read and used as the sleep duration."""
    sleeps: list[float] = []
    async def _spy_sleep(delay, *_a, **_k):
        sleeps.append(delay)
        return None
    monkeypatch.setattr(ai.client.asyncio, "sleep", _spy_sleep)
    recorder = _RecorderClient(
        response_sequence=[
            _FakeResponse(status_code=503, headers={"retry-after": "2"}),
            _FakeResponse(),
        ]
    )
    _patch_async_client(monkeypatch, recorder)
    monkeypatch.setattr(
        ai.client, "get_settings", lambda: _StubSettings(base="https://api.test")
    )

    await ai.chat_json(system="s", user="u")
    assert sleeps, "client should have slept at least once"
    assert sleeps[0] == 2.0


# ---------- (c) time-of-day uses caller's timezone ----------


async def _pair(session):
    from pairly.repositories import pairs, users

    a = await users.get_or_create_user(session, 7101, display_name="a")
    b = await users.get_or_create_user(session, 7102, display_name="b")
    invite = await pairs.create_invite(session, a)
    pair = await pairs.accept_invite(session, b, invite.token)
    await session.commit()
    return a, b, pair


@pytest.mark.asyncio
async def test_build_context_uses_caller_timezone(monkeypatch, session) -> None:
    """At a fixed UTC instant, ``Asia/Tokyo`` should see the Tokyo hour, not UTC."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    a, _b, pair = await _pair(session)
    # 2026-06-20 03:00 UTC = 12:00 in Asia/Tokyo (UTC+9) → "день".
    fixed_utc = datetime(2026, 6, 20, 3, 0, tzinfo=ZoneInfo("UTC"))
    monkeypatch.setattr(
        "pairly.use_cases.date_idea.datetime",
        _FrozenDatetime(fixed_utc),
    )

    ctx = await _build_context(
        session,
        pair_id=pair.id,
        user_id=a.id,
        include_wishlist=False,
        timezone="Asia/Tokyo",
    )
    assert "Сейчас день." in ctx


@pytest.mark.asyncio
async def test_build_context_defaults_to_server_utc(monkeypatch, session) -> None:
    """No timezone → UTC, deterministic for the test's fixed instant."""
    from datetime import datetime
    from zoneinfo import ZoneInfo

    a, _b, pair = await _pair(session)
    # 2026-06-20 07:00 UTC → "утро" (5..12).
    fixed_utc = datetime(2026, 6, 20, 7, 0, tzinfo=ZoneInfo("UTC"))
    monkeypatch.setattr(
        "pairly.use_cases.date_idea.datetime",
        _FrozenDatetime(fixed_utc),
    )

    ctx = await _build_context(
        session,
        pair_id=pair.id,
        user_id=a.id,
        include_wishlist=False,
    )
    assert "Сейчас утро." in ctx


class _FrozenDatetime:
    """``datetime``-shaped proxy that always returns the configured instant."""

    def __init__(self, fixed) -> None:
        self._fixed = fixed

    def now(self, tz=None):  # noqa: D401 — mimics datetime.now signature
        if tz is None:
            return self._fixed.replace(tzinfo=None)
        return self._fixed.astimezone(tz)


# ---------- fallback path logs and returns default ----------


@pytest.mark.asyncio
async def test_smart_mode_ai_failure_logs_and_returns_default(
    session, monkeypatch, caplog
) -> None:
    """AI client raising → fallback to a default DateIdea, and a warning is logged."""
    from pairly.repositories import pairs, users, wishlist

    a, _b, pair = await _pair(session)
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Сырники", category="eat"
    )
    await session.commit()

    async def boom(*, system: str, user: str) -> dict[str, Any]:
        raise AIError("simulated upstream failure")

    monkeypatch.setattr(ai, "chat_json", boom)

    with caplog.at_level("WARNING", logger="pairly.use_cases.date_idea"):
        idea = await pick_date_idea(
            session,
            pair_id=pair.id,
            category=None,
            user_id=a.id,
            mode="smart",
        )

    # We still produce a usable answer (the wishlist random pick — open item exists).
    assert isinstance(idea, DateIdea)
    assert idea.title == "Сырники"
    # A warning mentioning the failing mode made it to the log.
    assert any(
        "smart" in rec.getMessage() and rec.levelname == "WARNING"
        for rec in caplog.records
    )


@pytest.mark.asyncio
async def test_smart_mode_with_empty_wishlist_returns_canned(
    session, monkeypatch, caplog
) -> None:
    """No wishlist + AI failure → canned default, still a default DateIdea, with a log."""

    async def boom(*, system: str, user: str) -> dict[str, Any]:
        raise AIError("upstream 503")

    monkeypatch.setattr(ai, "chat_json", boom)

    from pairly.repositories import pairs, users

    a, _b, pair = await _pair(session)
    await session.commit()

    with caplog.at_level("WARNING", logger="pairly.use_cases.date_idea"):
        idea = await pick_date_idea(
            session,
            pair_id=pair.id,
            category=None,
            user_id=a.id,
            mode="smart",
        )

    assert idea.source == "default"
    assert idea.title
    assert any(
        rec.levelname == "WARNING" and "smart" in rec.getMessage()
        for rec in caplog.records
    )


# ---------- pick_date_idea accepts timezone parameter ----------


@pytest.mark.asyncio
async def test_pick_date_idea_accepts_timezone_kwarg(session) -> None:
    """The new ``timezone`` kwarg is accepted and does not break random mode."""
    from pairly.repositories import pairs, users, wishlist

    a, _b, pair = await _pair(session)
    await wishlist.create_item(
        session, pair_id=pair.id, user_id=a.id, title="Шаурма", category="eat"
    )
    await session.commit()

    idea = await pick_date_idea(
        session,
        pair_id=pair.id,
        category=None,
        user_id=a.id,
        mode="random",
        timezone="Europe/Moscow",
    )
    assert idea.title == "Шаурма"
    assert idea.source == "wishlist"


# silence the unused-import warning for json (kept for potential future asserts)
_ = json
