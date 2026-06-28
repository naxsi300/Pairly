"""FastAPI Mini App API — separate process from the bot, mounted at /api/*.

Auth: Telegram WebApp initData HMAC (production) or X-Dev-User-Id header (dev/test,
gated by PAIRLY_DEV_AUTH=1). The user is resolved on every request; pair_id is read
from the User row.

All DB writes go through the repository layer (pair-scoped). The API never bypasses it.
Every route resolves membership through the repos, which raise PairAccessError on a
non-member — mapped to 403 below. Unpaired users get 412 ("pair up first").

Request/response shapes live in `pairly.api.schemas` and accept both camelCase
(JS convention) and snake_case (Python convention) on the way in; serialization
is always camelCase on the way out.
"""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque

from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.api.schemas import (
    BucketCreate,
    BucketItemOut,
    BucketStatusUpdate,
    CountdownCreate,
    CountdownOut,
    CountdownUpdate,
    DateIdeaOut,
    GiftCreate,
    GiftItemOut,
    GiftsResponse,
    GiftTransition,
    LoveNoteCreate,
    LoveNoteOut,
    MilestoneOut,
    MoodEntryOut,
    MoodResponse,
    MoodSet,
    PairStats,
    QOTDAnswerIn,
    QOTDAnswerOut,
    QOTDQuestionOut,
    QOTDResponse,
    WishlistCreate,
    WishlistItemOut,
    WishlistStatusUpdate,
)
from pairly.auth import AuthContext, current_auth
from pairly.config import get_settings
from pairly.db.base import get_session
from pairly.db.models import GiftStatus, WishlistStatus
from pairly.repositories import (
    bucket,
    countdowns,
    gifts,
    love_notes,
    milestones,
    mood,
    qotd,
    wishlist,
)
from pairly.repositories.base import NotPairedError, PairAccessError
from pairly.repositories.bucket import BucketLimitError
from pairly.repositories.countdowns import CountdownLimitError
from pairly.repositories.gifts import GiftStateError
from pairly.repositories.mood import InvalidMoodError
from pairly.repositories.qotd import AnswerTooLongError
from pairly.repositories.wishlist import WishlistLimitError, WishlistStateError

# --- Middleware & rate-limit constants (Cluster 5) ---
# Body-size cap (1MB) is a hard DoS guard applied before auth. The cap is checked
# against the client's Content-Length so we don't allocate the body to reject it.
MAX_BODY_BYTES = 1_000_000

# In-process token-bucket-ish limits. We use a sliding window of timestamps per
# (key, route) — the route-level cap below is the per-window ceiling.
# Cheap, async-safe, no dependency. Per-process state is fine for MVP: a multi-
# worker reverse proxy would distribute the load, so the effective per-user cap
# is roughly N_workers * cap. Acceptable — we want DoS protection, not a strict
# quota.
_RATE_LIMIT_WINDOW = 60.0  # seconds

# route -> (max requests per window). /api/date-idea is the AI path so it's
# the most expensive; POST mood/qotd/love-notes are cheap but cap anyway.
_RATE_LIMITS: dict[str, int] = {
    "/api/date-idea": 10,
    "/api/mood": 30,
    "/api/qotd/answer": 30,
    "/api/love-notes": 30,
}
# Routes rate-limited as POSTs.
_RATE_LIMIT_POST_ROUTES = {"/api/mood", "/api/qotd/answer", "/api/love-notes"}

# Sliding window store: {key: {route: deque[float]}}. We only keep one global
# lock so the per-request overhead is a single acquire; a single asyncio.Lock
# is fine for MVP (deques are O(1) append and we cap their length).
_rate_lock = asyncio.Lock()
_rate_buckets: dict[str, dict[str, deque[float]]] = defaultdict(
    lambda: defaultdict(deque)
)


def _check_rate_limit(key: str, route: str, *, now: float) -> tuple[bool, int]:
    """Return (allowed, retry_after_seconds). Holds the rate lock briefly.

    Eviction: any timestamp older than _RATE_LIMIT_WINDOW is popped. The deque
    never grows past the cap+1 in practice (we pop as we go), so memory is bounded.
    """
    cap = _RATE_LIMITS.get(route)
    if cap is None:
        return True, 0
    buckets = _rate_buckets[key]
    dq = buckets[route]
    cutoff = now - _RATE_LIMIT_WINDOW
    while dq and dq[0] < cutoff:
        dq.popleft()
    if len(dq) >= cap:
        # Retry-After = time until the OLDEST timestamp ages out + 1s, so the
        # client doesn't hammer back at the exact second the window opens.
        retry_after = max(1, int(dq[0] + _RATE_LIMIT_WINDOW - now) + 1)
        return False, retry_after
    dq.append(now)
    return True, 0


def _client_key(request: Request) -> str:
    """Best-effort per-client key. We prefer the resolved user (set by the
    auth dependency) and fall back to the client IP for unauthenticated probes
    (e.g. the 413 short-circuit path)."""
    auth_user = getattr(request.state, "auth_user", None)
    if auth_user is not None:
        return f"u:{auth_user}"
    if request.client is not None and request.client.host:
        return f"ip:{request.client.host}"
    return "ip:unknown"


def _require_pair(auth: AuthContext) -> str:
    """Return the user's pair_id or raise 412 (unpaired user hitting a shared feature)."""
    if auth.user.pair_id is None:
        raise HTTPException(status.HTTP_412_PRECONDITION_FAILED, detail="pair up first")
    return auth.user.pair_id


async def _partner_display_name(
    session: AsyncSession, *, pair_id: str, viewer_id: str
) -> str | None:
    """The OTHER member's display name (or tg handle) for UI labels like partnerName."""
    from pairly.repositories.base import pair_members

    for m in await pair_members(session, pair_id):
        if m.id != viewer_id:
            if m.display_name:
                return m.display_name
            return f"@{m.tg_username}" if m.tg_username else None
    return None


def _infer_media_type(file_path: str | None) -> str:
    """Best-effort media-type guess from the file extension. Defaults to image/jpeg
    because the photo endpoint is used only for Telegram photo_file entries — we
    never want to advertise the wrong Content-Type to a browser <img> tag."""
    if not file_path:
        return "image/jpeg"
    lower = file_path.lower()
    if lower.endswith((".jpg", ".jpeg")):
        return "image/jpeg"
    if lower.endswith(".png"):
        return "image/png"
    if lower.endswith(".webp"):
        return "image/webp"
    if lower.endswith(".gif"):
        return "image/gif"
    return "image/jpeg"


def create_app() -> FastAPI:
    # Boot guard: dev-auth (PAIRLY_DEV_AUTH=1) is a full unauthenticated impersonation
    # of any user via X-Dev-User-Id — it MUST NOT be reachable on a public bind.
    # Fail fast at import rather than serving an open bypass to the internet.
    #
    # Cluster 5 (f): api_host is not the only way uvicorn can end up on a public
    # bind — the docker entrypoint forces --host 0.0.0.0 at runtime, overriding
    # whatever api_host says in the env. The new `api_deploy` knob (set to
    # "docker" in the prod entrypoint) closes that bypass: when dev_auth is on
    # AND we're in a docker deploy, refuse even on loopback. Production has
    # dev_auth off, so neither branch fires.
    settings = get_settings()
    if settings.dev_auth:
        is_loopback = settings.api_host in ("127.0.0.1", "localhost", "::1")
        is_docker = settings.api_deploy == "docker"
        if not is_loopback or is_docker:
            raise RuntimeError(
                "PAIRLY_DEV_AUTH=1 refuses to run on a public bind "
                f"(api_host={settings.api_host!r}, api_deploy={settings.api_deploy!r}). "
                "Set PAIRLY_DEV_AUTH=0 or bind loopback (native only)."
            )

    app = FastAPI(title="Pairly Mini App API", version="0.1.0")

    # --- Cluster 5 (d) body-size cap ---
    # Reject requests with Content-Length > MAX_BODY_BYTES before anything else
    # runs. We use the header (not the body) so the cap is a constant-time check
    # and we never allocate a giant payload just to discard it. Chunks are not
    # covered (Content-Length missing) — uvicorn's own --limit-max-requests body
    # cap is the backstop; this layer is the API contract.
    @app.middleware("http")
    async def _body_size_cap(request: Request, call_next):
        cl = request.headers.get("content-length")
        if cl is not None:
            try:
                if int(cl) > MAX_BODY_BYTES:
                    return Response(
                        b'{"detail":"body too large"}',
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        media_type="application/json",
                    )
            except ValueError:
                # Malformed Content-Length: refuse rather than guess.
                return Response(
                    b'{"detail":"bad content-length"}',
                    status_code=status.HTTP_400_BAD_REQUEST,
                    media_type="application/json",
                )
        return await call_next(request)

    # --- Cluster 5 (e) rate limit ---
    # Per-(key, route) sliding window, async-safe. We don't know the user at
    # middleware time (auth runs inside the route via Depends), so we key on
    # the client IP for unauthenticated cases. Routes get a fresh decision per
    # request — the lock is held only long enough to pop+append the deque.
    @app.middleware("http")
    async def _rate_limit(request: Request, call_next):
        path = request.url.path
        # Only the routes that have a configured cap; everything else is a
        # free pass.
        route_key: str | None = None
        if path == "/api/date-idea" or path in _RATE_LIMIT_POST_ROUTES and request.method == "POST":
            route_key = path
        if route_key is not None:
            key = _client_key(request)
            async with _rate_lock:
                ok, retry_after = _check_rate_limit(key, route_key, now=time.monotonic())
            if not ok:
                return Response(
                    b'{"detail":"rate limited"}',
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    media_type="application/json",
                    headers={"Retry-After": str(retry_after)},
                )
        return await call_next(request)

    app.add_exception_handler(PairAccessError, _forbidden)
    app.add_exception_handler(NotPairedError, _precondition)
    app.add_exception_handler(LookupError, _not_found)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # --- pair stats (ambient shared-counters, not goals/streaks) ---
    @app.get("/api/pair/stats")
    async def pair_stats(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        pair_id = _require_pair(auth)
        now = __import__("datetime").datetime.now(__import__("datetime").UTC)

        # Together-days from pair.created_at (if available, else 0).
        pair_obj = await session.get(
            __import__("pairly.db.models", fromlist=["Pair"]).Pair, pair_id
        )
        created_at = pair_obj.created_at if pair_obj else None
        together_days = 0
        if created_at is not None:
            c = created_at if created_at.tzinfo else created_at.replace(tzinfo=__import__("datetime").UTC)
            together_days = (now - c).days

        # Ambient counts — warm stats, not progress bars.
        wl = await wishlist.list_items(session, pair_id=pair_id, user_id=auth.user.id)
        wl_done = sum(1 for i in wl if i.status.value == "done")
        gifts_list = await gifts.list_gifts(session, pair_id=pair_id, user_id=auth.user.id)
        gifts_done = await gifts.count_completed(session, pair_id=pair_id)

        from sqlalchemy import func, select

        from pairly.db.models import Countdown, QOTDAnswer

        qotd_n = int((await session.execute(
            select(func.count(QOTDAnswer.id)).where(QOTDAnswer.pair_id == pair_id)
        )).scalar_one() or 0)
        cd_n = int((await session.execute(
            select(func.count(Countdown.id)).where(Countdown.pair_id == pair_id)
        )).scalar_one() or 0)

        # Check and emit together-days milestone (fires on the first fetch when threshold crossed).
        td_ms = await milestones.check_together_days(session, pair_id=pair_id, days=together_days)

        await session.commit()

        result = PairStats(
            together_days=together_days,
            total_wishlist=len(wl),
            wishlist_done=wl_done,
            total_gifts=len(gifts_list),
            gifts_completed=gifts_done,
            total_qotd_answers=qotd_n,
            total_countdowns=cd_n,
            created_at=created_at,
            is_pro=bool(pair_obj and pair_obj.is_pro()),
        ).model_dump(by_alias=True)
        if td_ms:
            result["newMilestones"] = [
                MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True) for m in td_ms
            ]
        return result

    # --- wishlist ---
    @app.get("/api/wishlist", response_model=list[WishlistItemOut])
    async def get_wishlist(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[WishlistItemOut]:
        pair_id = _require_pair(auth)
        items = await wishlist.list_items(session, pair_id=pair_id, user_id=auth.user.id)
        out = []
        for i in items:
            o = WishlistItemOut.model_validate(i)
            o.mine = i.created_by == auth.user.id
            out.append(o)
        return out

    @app.get("/api/wishlist/{item_id}/photo")
    async def get_wishlist_photo(
        item_id: str,
        request: Request,
        init_data: str = "",
        dev_user_id: str = "",
        x_telegram_init_data: str = Header("", alias="X-Telegram-Init-Data"),
        x_dev_user_id: str = Header("", alias="X-Dev-User-Id"),
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """Proxy a forwarded photo's bytes — NEVER redirect to Telegram directly.

        Cluster 5 (a): a 302 to bot.session.api.file_url(bot.token, path) embeds
        the FULL BOT TOKEN in the Location header. Any browser/proxy that logs
        the response leaks the token. Instead, we resolve the Telegram temp file
        server-side with bot.download_file(...) and stream the bytes back. The
        token never leaves the process.

        Auth: this endpoint accepts EITHER the X-Telegram-Init-Data header
        (preferred) OR the init_data query param (for <img src> tags that can't
        set custom headers). The header is read explicitly so an <img> that only
        has the query param still works; a fetch() that sends the header doesn't
        need a query string. dev_auth accepts the dev headers the same way.
        Membership is still enforced — the item must belong to the caller's pair.

        Returns 204 when the item has no photo, 404 when absent, 502 if Telegram
        declines the lookup — best-effort, the <img> just stays empty.
        """
        from pairly.auth import resolve_init_data
        from pairly.bot.notify import _get_bot

        # Prefer the header, fall back to the query param. Same initData either way.
        effective_init = x_telegram_init_data or init_data
        effective_dev = x_dev_user_id or dev_user_id
        auth = await resolve_init_data(
            effective_init, session, dev_user_id=effective_dev
        )
        pair_id = _require_pair(auth)  # 412 if unpaired
        try:
            item = await wishlist.get_item(
                session, pair_id=pair_id, user_id=auth.user.id, item_id=item_id
            )
        except LookupError:
            return Response(status_code=404)
        if not item.telegram_file_id:
            return Response(status_code=204)
        bot = _get_bot()
        try:
            file = await bot.get_file(item.telegram_file_id)
        except Exception:
            return Response(status_code=502)
        if not file.file_path:
            return Response(status_code=204)
        # Resolve Telegram's file to bytes server-side. aiogram returns a
        # BytesIO when destination is omitted; .read() gives the full payload.
        try:
            buf = await bot.download_file(file.file_path)
            data = buf.read() if buf is not None else b""
        except Exception:
            return Response(status_code=502)
        if not data:
            return Response(status_code=204)
        media_type = _infer_media_type(file.file_path)
        return Response(
            content=data,
            media_type=media_type,
            # 5 min private cache — the <img> is hot on a single client, but
            # never share across users (membership still gates the path).
            headers={"Cache-Control": "private, max-age=300"},
        )

    @app.get("/api/date-idea", response_model=DateIdeaOut)
    async def get_date_idea(
        category: str | None = None,
        mode: str = "random",
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> DateIdeaOut:
        """Spin the date-wheel. mode=random (free) picks from the wishlist;
        smart/lucky (Pro) use the OmniRoute AI. AI falls back to random if unset."""
        from pairly.db.models import Pair
        from pairly.use_cases.date_idea import pick_date_idea

        pair_id = _require_pair(auth)
        if mode in ("smart", "lucky"):
            pair_obj = await session.get(Pair, pair_id)
            if not (pair_obj and pair_obj.is_pro()):
                raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail="Pro feature")
        idea = await pick_date_idea(
            session,
            pair_id=pair_id,
            category=category,
            mode=mode,
            user_id=auth.user.id,
            timezone=getattr(auth.user, "timezone", None),
        )
        return DateIdeaOut(source=idea.source, title=idea.title, category=idea.category, reason=idea.reason)

    # --- love notes ---
    @app.get("/api/love-notes", response_model=list[LoveNoteOut])
    async def get_love_notes(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[LoveNoteOut]:
        pair_id = _require_pair(auth)
        notes = await love_notes.list_notes(session, pair_id=pair_id, user_id=auth.user.id)
        return [
            LoveNoteOut(
                id=n.id,
                body=n.body,
                deliver_at=n.deliver_at,
                mine=n.created_by == auth.user.id,
                read_by_recipient=n.read_by_recipient,
                created_at=n.created_at,
            )
            for n in notes
        ]

    @app.post("/api/love-notes", response_model=LoveNoteOut)
    async def post_love_note(
        payload: LoveNoteCreate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> LoveNoteOut:
        pair_id = _require_pair(auth)
        note = await love_notes.create_note(
            session,
            pair_id=pair_id,
            user_id=auth.user.id,
            body=payload.body,
            deliver_at=payload.deliver_at,
        )
        await session.commit()
        # Deliver to the partner now (deliver_at is a future-cron hint; no scheduler
        # yet, so deliver immediately rather than dropping). Best-effort + silent.
        from pairly.bot.notify import notify_love_note

        await notify_love_note(
            session, pair_id=pair_id, actor_id=auth.user.id
        )
        return LoveNoteOut(
            id=note.id,
            body=note.body,
            deliver_at=note.deliver_at,
            mine=True,
            read_by_recipient=False,
            created_at=note.created_at,
        )

    @app.post("/api/love-notes/{note_id}/read", response_model=LoveNoteOut)
    async def read_love_note(
        note_id: str,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> LoveNoteOut:
        pair_id = _require_pair(auth)
        try:
            n = await love_notes.mark_read(
                session, pair_id=pair_id, user_id=auth.user.id, note_id=note_id
            )
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="note not found") from exc
        await session.commit()
        return LoveNoteOut(
            id=n.id,
            body=n.body,
            deliver_at=n.deliver_at,
            mine=n.created_by == auth.user.id,
            read_by_recipient=n.read_by_recipient,
            created_at=n.created_at,
        )

    @app.post("/api/wishlist/{item_id}/approve", response_model=WishlistItemOut)
    async def approve_wishlist_item(
        item_id: str,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> WishlistItemOut:
        """Two-tap consent: approve a pending forwarded item (partner action)."""
        pair_id = _require_pair(auth)
        # Cluster 4a: capture pre-call status so the forwarder notify can detect
        # the idempotent re-tap (OPEN -> OPEN) and skip the warm beat.
        try:
            pre = await wishlist.get_item(
                session, pair_id=pair_id, user_id=auth.user.id, item_id=item_id
            )
            was_open_before = pre.status == WishlistStatus.OPEN
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="item not found") from exc
        try:
            item = await wishlist.approve_item(
                session, pair_id=pair_id, user_id=auth.user.id, item_id=item_id
            )
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="item not found") from exc
        await session.commit()
        # Cluster 4a: notify the forwarder (item.created_by) — symmetric with
        # the bot path. The notifier itself skips self-approve and re-tap.
        from pairly.bot.notify import notify_wishlist_approved

        item.was_open_before = was_open_before  # type: ignore[attr-defined]
        await notify_wishlist_approved(
            session, pair_id=pair_id, item=item, approver_id=auth.user.id
        )
        out = WishlistItemOut.model_validate(item)
        out.mine = item.created_by == auth.user.id
        return out

    @app.post("/api/wishlist")
    async def post_wishlist(
        payload: WishlistCreate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        pair_id = _require_pair(auth)
        try:
            item = await wishlist.create_item(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                title=payload.title,
                address=payload.address,
                category=payload.category,
                notes=payload.notes,
            )
            from pairly.repositories import milestones as ms_repo
            new_ms = await ms_repo.check_wishlist(
                session,
                pair_id=pair_id,
                count=await wishlist.count_open(session, pair_id),
            )
            await session.commit()
        except WishlistLimitError as exc:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
        # Cluster 5 (b): the bot's /forward path notifies the partner; the API
        # path must too, otherwise mini-app-only users silently drop the beat.
        # Best-effort + never raises (notify_wishlist_added swallows internally).
        from pairly.bot.notify import notify_wishlist_added

        await notify_wishlist_added(
            session, pair_id=pair_id, actor_id=auth.user.id, title=item.title
        )
        out = WishlistItemOut.model_validate(item).model_dump(by_alias=True)
        out["mine"] = item.created_by == auth.user.id
        out["newMilestones"] = [
            MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True) for m in new_ms
        ]
        return out

    @app.post("/api/mark-done")
    async def mark_done(
        payload: WishlistStatusUpdate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        return await _wishlist_set_status(session, auth, payload.item_id, "done")

    @app.post("/api/wishlist/{item_id}/status")
    async def wishlist_status(
        item_id: str,
        payload: WishlistStatusUpdate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        return await _wishlist_set_status(session, auth, item_id, payload.status)

    @app.delete("/api/wishlist/{item_id}")
    async def delete_wishlist(
        item_id: str,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, bool]:
        pair_id = _require_pair(auth)
        from pairly.db.models import WishlistItem

        await wishlist.get_item(session, pair_id=pair_id, user_id=auth.user.id, item_id=item_id)
        await session.delete(await session.get(WishlistItem, item_id))
        await session.commit()
        return {"ok": True}

    # --- bucket ---
    @app.get("/api/bucket", response_model=list[BucketItemOut])
    async def get_bucket(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[BucketItemOut]:
        pair_id = _require_pair(auth)
        items = await bucket.list_items(session, pair_id=pair_id, user_id=auth.user.id)
        return [BucketItemOut.model_validate(i) for i in items]

    @app.post("/api/bucket", response_model=BucketItemOut)
    async def post_bucket(
        payload: BucketCreate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> BucketItemOut:
        pair_id = _require_pair(auth)
        try:
            item = await bucket.create_item(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                title=payload.title,
                note=payload.note,
                category=payload.category,
            )
            await session.commit()
        except BucketLimitError as exc:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
        return BucketItemOut.model_validate(item)

    @app.post("/api/bucket/{item_id}/status", response_model=BucketItemOut)
    async def bucket_status(
        item_id: str,
        payload: BucketStatusUpdate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> BucketItemOut:
        from pairly.db.models import BucketStatus

        pair_id = _require_pair(auth)
        try:
            item = await bucket.set_status(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                item_id=item_id,
                status=BucketStatus(payload.status),
            )
            await session.commit()
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found") from exc
        return BucketItemOut.model_validate(item)

    @app.delete("/api/bucket/{item_id}")
    async def delete_bucket(
        item_id: str,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, bool]:
        pair_id = _require_pair(auth)
        try:
            await bucket.delete_item(session, pair_id=pair_id, user_id=auth.user.id, item_id=item_id)
            await session.commit()
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found") from exc
        return {"ok": True}

    # --- countdowns ---
    @app.get("/api/countdowns", response_model=list[CountdownOut])
    async def get_countdowns(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[CountdownOut]:
        pair_id = _require_pair(auth)
        items = await countdowns.list_items(session, pair_id=pair_id, user_id=auth.user.id)
        return [_to_countdown_out(i) for i in items]

    @app.post("/api/countdowns")
    async def post_countdowns(
        payload: CountdownCreate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        pair_id = _require_pair(auth)
        try:
            item = await countdowns.create_item(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                label=payload.label,
                target_date=payload.target_date,
                emoji=payload.emoji,
                recurrence=payload.recurrence,
            )
            from pairly.repositories import milestones as ms_repo
            new_ms = await ms_repo.check_countdown(
                session,
                pair_id=pair_id,
                count=await countdowns.count_items(session, pair_id),
            )
            await session.commit()
        except CountdownLimitError as exc:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
        out = _to_countdown_out(item).model_dump(by_alias=True)
        out["newMilestones"] = [
            MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True) for m in new_ms
        ]
        return out

    @app.delete("/api/countdowns/{item_id}")
    async def delete_countdowns(
        item_id: str,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, bool]:
        pair_id = _require_pair(auth)
        try:
            await countdowns.delete_item(
                session, pair_id=pair_id, user_id=auth.user.id, item_id=item_id
            )
            await session.commit()
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found") from exc
        return {"ok": True}

    @app.patch("/api/countdowns/{item_id}")
    async def patch_countdowns(
        item_id: str,
        payload: CountdownUpdate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        pair_id = _require_pair(auth)
        try:
            # Only fields the client actually sent (exclude_unset), so an explicit
            # null clears a column while omitted fields are left untouched.
            fields = payload.model_dump(exclude_unset=True, by_alias=False)
            item = await countdowns.update_item(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                item_id=item_id,
                fields=fields,
            )
            await session.commit()
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found") from exc
        return _to_countdown_out(item).model_dump(by_alias=True)

    # --- mood ---
    @app.get("/api/mood", response_model=MoodResponse)
    async def get_mood(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> MoodResponse:
        pair_id = _require_pair(auth)
        moods = await mood.current_moods(session, pair_id=pair_id, user_id=auth.user.id)
        partner = next((v for k, v in moods.items() if k != auth.user.id), None)
        return MoodResponse(
            **{"self": _to_mood_out(moods.get(auth.user.id))},
            partner=_to_mood_out(partner),
            partner_name=await _partner_display_name(
                session, pair_id=pair_id, viewer_id=auth.user.id
            ),
        )

    @app.post("/api/mood")
    async def post_mood(
        payload: MoodSet,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        pair_id = _require_pair(auth)
        try:
            entry = await mood.set_mood(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                mood=payload.mood,
                note=payload.note,
            )
            # Check mood mutual milestone: both partners set mood on the same day N times.
            mutual_days = await mood.count_mutual_mood_days(session, pair_id=pair_id)
            new_ms = await milestones.check_mood_mutual(session, pair_id=pair_id, count=mutual_days)
            await session.commit()
        except InvalidMoodError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        # NOTE: no mood notification — docs/copy/mood-sync.md forbids it (ambient only).
        out = _to_mood_out(entry).model_dump(by_alias=True)
        if new_ms:
            out["newMilestones"] = [
                MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True) for m in new_ms
            ]
        return out

    @app.delete("/api/mood")
    async def clear_mood(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, bool]:
        pair_id = _require_pair(auth)
        await mood.clear_mood(session, pair_id=pair_id, user_id=auth.user.id)
        await session.commit()
        return {"ok": True}

    # --- question of the day ---
    @app.get("/api/qotd", response_model=QOTDResponse)
    async def get_qotd(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> QOTDResponse:
        """Today's question + the reveal-gated view, in the client's flat shape.

        my_answer is present if the caller answered. partner_answer is present ONLY if
        the caller answered (hard gate, enforced in qotd.partner_answer). partner_answered
        is a separate bool so the UI can say "waiting for partner" even when the body is
        gated. Unpaired users get 412.
        """
        pair_id = _require_pair(auth)
        question = await qotd.todays_question(session)
        if question is None:
            return QOTDResponse(question=None)
        mine = await qotd.my_answer(
            session, pair_id=pair_id, user_id=auth.user.id, question_id=question.id
        )
        partner = await qotd.partner_answer(
            session, pair_id=pair_id, user_id=auth.user.id, question_id=question.id
        )
        # Did the partner answer at all (independent of the reveal gate)? We can only
        # know this honestly if we look directly — but we must NOT leak the body unless
        # the caller answered. partner_answer already enforces that, so here we derive
        # partner_answered from a non-leaking check.
        partner_answered = await qotd.partner_has_answered(
            session, pair_id=pair_id, user_id=auth.user.id, question_id=question.id
        )
        return QOTDResponse(
            question=QOTDQuestionOut(
                id=question.id, text=question.text, category=question.category
            ),
            my_answer=mine.body if mine else None,
            partner_answered=partner_answered,
            partner_answer=partner.body if partner else None,
            partner_name=await _partner_display_name(
                session, pair_id=pair_id, viewer_id=auth.user.id
            ),
        )

    @app.post("/api/qotd/answer")
    async def post_qotd(
        payload: QOTDAnswerIn,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ):
        pair_id = _require_pair(auth)
        # Accept both {answer: "..."} and {body: "..."} from the client.
        body = (payload.answer or payload.body or "").strip()
        if not body:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="empty answer")
        # question_id optional — if absent, pick today's question.
        question_id = payload.question_id
        if not question_id:
            q = await qotd.todays_question(session)
            if q is None:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST, detail="no question for today"
                )
            question_id = q.id
        try:
            # Cluster 4b: capture whether the caller ALREADY had an answer for
            # this question BEFORE posting. If they did, this is a same-day
            # re-answer (body update) — NOT a first-cross. Without this guard
            # the mutual notify would fire on every re-answer, spamming the
            # partner each time they tweak their text.
            mine_existed_before = (
                await qotd.my_answer(
                    session,
                    pair_id=pair_id,
                    user_id=auth.user.id,
                    question_id=question_id,
                )
                is not None
            )
            answer = await qotd.post_answer(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                question_id=question_id,
                body=body,
            )
            from sqlalchemy import func, select

            from pairly.db.models import QOTDAnswer
            n = int((await session.execute(
                select(func.count(QOTDAnswer.id)).where(QOTDAnswer.pair_id == pair_id)
            )).scalar_one())
            new_ms = await milestones.check_qotd(session, pair_id=pair_id, count=n)
            await session.commit()
        except AnswerTooLongError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail=f"answer too long: {exc}"
            ) from exc
        # After answering, the caller has cleared the reveal gate — recompute the
        # partner's state for THIS caller and return the client's flat shape so the
        # UI can spread it straight into its QOTDState.
        p_answered = await qotd.partner_has_answered(
            session, pair_id=pair_id, user_id=auth.user.id, question_id=question_id
        )
        # Notification beat: fire the mutual reveal ONLY on the first cross —
        # partner already answered AND the caller did NOT have an answer before
        # this call. Otherwise a same-day re-answer would re-fire and nag.
        # Otherwise a soft single ping (cooldown-gated).
        if p_answered and not mine_existed_before:
            from pairly.bot.notify import notify_qotd_mutual

            await notify_qotd_mutual(session, pair_id=pair_id, actor_id=auth.user.id)
        elif not mine_existed_before:
            # Only the answered ping respects the first-cross gate too; re-answers
            # don't poke the partner a second time.
            from pairly.bot.notify import notify_qotd_answered

            await notify_qotd_answered(session, pair_id=pair_id, actor_id=auth.user.id)
        partner_obj = await qotd.partner_answer(
            session, pair_id=pair_id, user_id=auth.user.id, question_id=question_id
        )
        out = {
            "myAnswer": answer.body,
            "partnerAnswered": p_answered,
            "partnerAnswer": partner_obj.body if partner_obj else None,
        }
        out["newMilestones"] = [
            MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True) for m in new_ms
        ]
        return out

    # --- gifts ---
    @app.get("/api/gifts", response_model=GiftsResponse)
    async def get_gifts(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> GiftsResponse:
        pair_id = _require_pair(auth)
        items = await gifts.list_gifts(session, pair_id=pair_id, user_id=auth.user.id)
        return GiftsResponse(
            items=[_to_gift_out(i, auth.user.id) for i in items],
            partner_name=await _partner_display_name(
                session, pair_id=pair_id, viewer_id=auth.user.id
            ),
        )

    @app.post("/api/gifts")
    async def post_gifts(
        payload: GiftCreate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        pair_id = _require_pair(auth)
        item = await gifts.create_gift(
            session,
            pair_id=pair_id,
            giver_id=auth.user.id,
            gesture=payload.gesture,
            description=payload.description,
        )
        active = [
            g for g in await gifts.list_gifts(session, pair_id=pair_id, user_id=auth.user.id)
            if g.status.value not in ("declined", "archived")
        ]
        new_ms = await milestones.check_gift(session, pair_id=pair_id, count=len(active))
        await session.commit()
        from pairly.bot.notify import notify_gift_received

        await notify_gift_received(
            session, pair_id=pair_id, actor_id=auth.user.id, gesture=item.gesture
        )
        out = _to_gift_out(item, auth.user.id).model_dump(by_alias=True)
        out["newMilestones"] = [
            MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True) for m in new_ms
        ]
        return out

    @app.post("/api/gifts/{gift_id}/transition")
    async def gift_transition(
        gift_id: str,
        payload: GiftTransition,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        pair_id = _require_pair(auth)
        try:
            item = await gifts.transition(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                gift_id=gift_id,
                to=GiftStatus(payload.status),
            )
            await session.commit()
        except GiftStateError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        # Tell the giver when the receiver accepts/declines, and the receiver when
        # the giver marks it done. actor_id is who acted; _partner() resolves to the
        # other side. Always-notify (gifts are rare, relationship-core).
        if item.status == GiftStatus.REDEEMED:
            from pairly.bot.notify import notify_gift_redeemed

            await notify_gift_redeemed(
                session, pair_id=pair_id, actor_id=auth.user.id, gesture=item.gesture
            )
        elif item.status == GiftStatus.COMPLETE:
            # Check gift_completed milestone when a gift finishes the full lifecycle.
            completed_count = await gifts.count_completed(session, pair_id=pair_id)
            new_ms_c = await milestones.check_gift_completed(
                session, pair_id=pair_id, count=completed_count
            )
            # Commit the milestone row so it survives the request. Without this,
            # the milestone stays flushed-but-uncommitted and is rolled back when
            # the session tears down at end-of-request — invisible to subsequent
            # fetches.
            await session.commit()
            # Cluster 5 (c): the COMPLETE beat is a relationship-core moment
            # ("we did this together"). Tell the partner, symmetrically with
            # REDEEMED/CLAIMED/DECLINED above. Best-effort + never raises.
            from pairly.bot.notify import notify_gift_completed

            await notify_gift_completed(
                session, pair_id=pair_id, actor_id=auth.user.id, gesture=item.gesture
            )
            if new_ms_c:
                result = _to_gift_out(item, auth.user.id).model_dump(by_alias=True)
                result["newMilestones"] = [
                    MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True)
                    for m in new_ms_c
                ]
                return result
        elif item.status == GiftStatus.CLAIMED:
            from pairly.bot.notify import notify_gift_accepted

            await notify_gift_accepted(
                session, pair_id=pair_id, actor_id=auth.user.id, gesture=item.gesture
            )
        elif item.status == GiftStatus.DECLINED:
            from pairly.bot.notify import notify_gift_declined

            await notify_gift_declined(
                session, pair_id=pair_id, actor_id=auth.user.id, gesture=item.gesture
            )
        return _to_gift_out(item, auth.user.id).model_dump(by_alias=True)

    # --- admin (hidden) — gated by PAIRLY_ADMIN_TG_IDS. Non-admins get 404, so the
    # endpoints are invisible to regular users (and the Mini App's hidden menu). ---
    from pairly.config import admin_tg_id_set
    from pairly.db.models import Pair
    from pairly.repositories import admin as admin_repo

    def _is_admin(auth: AuthContext) -> bool:
        return auth.user.tg_id in admin_tg_id_set()

    @app.get("/api/admin/status")
    async def admin_status(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        if not _is_admin(auth):
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        pair_id = _require_pair(auth)
        pair_obj = await session.get(Pair, pair_id)
        return {
            "pairId": pair_id,
            "userId": auth.user.id,
            "tgId": auth.user.tg_id,
            "tier": pair_obj.tier.value if pair_obj else None,
            "isPro": bool(pair_obj and pair_obj.is_pro()),
            "adminEnabled": True,
        }

    @app.post("/api/admin/toggle-pro")
    async def admin_toggle_pro(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        if not _is_admin(auth):
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        pair_id = _require_pair(auth)
        pair_obj = await session.get(Pair, pair_id)
        if pair_obj is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        try:
            if pair_obj.is_pro():
                await admin_repo.revoke_pro(
                    session, actor_tg_id=auth.user.tg_id, target_pair_id=pair_id
                )
            else:
                await admin_repo.grant_pro(
                    session, actor_tg_id=auth.user.tg_id, target_pair_id=pair_id
                )
        except admin_repo.AdminError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        await session.commit()
        pair_obj = await session.get(Pair, pair_id)
        return {"isPro": bool(pair_obj and pair_obj.is_pro())}

    # --- admin: manage ALL pairs (dashboard) — admin-gated, 404 for non-admins ---

    def _pair_out(pair: Pair, members: list) -> dict:  # type: ignore[type-arg]
        return {
            "pairId": pair.id,
            "tier": pair.tier.value,
            "isPro": pair.is_pro(),
            "dissolved": pair.dissolved_at is not None,
            "createdAt": pair.created_at.isoformat() if pair.created_at else None,
            "members": [
                {
                    "tgId": m.tg_id,
                    "name": m.display_name,
                    "username": m.tg_username,
                }
                for m in members
            ],
        }

    @app.get("/api/admin/stats")
    async def admin_stats(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        if not _is_admin(auth):
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        return await admin_repo.pair_counts(session)

    @app.get("/api/admin/pairs")
    async def admin_list_pairs(
        limit: int = 20,
        offset: int = 0,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        if not _is_admin(auth):
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        rows = await admin_repo.list_pairs(session, limit=limit, offset=offset)
        return {"items": [_pair_out(p, ms) for p, ms in rows]}

    @app.get("/api/admin/lookup")
    async def admin_lookup_pair(
        tg: int,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        """Resolve a pair by any member's Telegram id."""
        from sqlalchemy import select as _select

        from pairly.db.models import User

        if not _is_admin(auth):
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        resolved = await admin_repo.resolve_pair_by_tg_id(session, tg)
        if resolved is None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="pair not found")
        _user, pair = resolved
        members = list((await session.execute(_select(User).where(User.pair_id == pair.id))).scalars())
        return _pair_out(pair, members)

    @app.post("/api/admin/pairs/{target_pair_id}/pro")
    async def admin_grant_pro(
        target_pair_id: str,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        if not _is_admin(auth):
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        try:
            pair = await admin_repo.grant_pro(
                session, actor_tg_id=auth.user.tg_id, target_pair_id=target_pair_id
            )
        except admin_repo.AdminError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        await session.commit()
        return {"isPro": pair.is_pro()}

    @app.delete("/api/admin/pairs/{target_pair_id}/pro")
    async def admin_revoke_pro(
        target_pair_id: str,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        if not _is_admin(auth):
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        try:
            pair = await admin_repo.revoke_pro(
                session, actor_tg_id=auth.user.tg_id, target_pair_id=target_pair_id
            )
        except admin_repo.AdminError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        await session.commit()
        return {"isPro": pair.is_pro()}

    @app.get("/api/admin/audit")
    async def admin_audit(
        limit: int = 20,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict:
        if not _is_admin(auth):
            raise HTTPException(status.HTTP_404_NOT_FOUND)
        rows = await admin_repo.recent_audit(session, limit=limit)
        return {
            "items": [
                {
                    "actorTgId": r.actor_tg_id,
                    "action": r.action,
                    "targetPairId": r.target_pair_id,
                    "detail": r.detail,
                    "createdAt": r.created_at.isoformat() if r.created_at else None,
                }
                for r in rows
            ]
        }

    return app


# --- helpers ------------------------------------------------------------------


async def _wishlist_set_status(
    session: AsyncSession, auth: AuthContext, item_id: str, status_str: str
) -> dict:
    pair_id = _require_pair(auth)
    from pairly.db.models import WishlistStatus

    try:
        item = await wishlist.set_status(
            session,
            pair_id=pair_id,
            user_id=auth.user.id,
            item_id=item_id,
            status=WishlistStatus(status_str),
        )
        await session.commit()
    except LookupError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found") from exc
    except WishlistStateError as exc:
        # Illegal transition (e.g. PENDING -> DONE, DONE -> OPEN, ARCHIVED -> *).
        # Map to 409 Conflict — the client's state is out of sync with the server.
        raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    out = WishlistItemOut.model_validate(item).model_dump(by_alias=True)
    out["mine"] = item.created_by == auth.user.id
    return out


def _to_countdown_out(item) -> CountdownOut:
    return CountdownOut(
        id=item.id,
        label=item.label,
        emoji=item.emoji,
        target_date=item.target_date,
        recurrence=item.recurrence,
    )


def _to_mood_out(entry) -> MoodEntryOut | None:
    if entry is None:
        return None
    return MoodEntryOut(mood=entry.mood, note=entry.note, set_at=entry.set_at)


def _to_answer_out(answer) -> QOTDAnswerOut | None:
    if answer is None:
        return None
    return QOTDAnswerOut(body=answer.body, answered_at=answer.answer_date)


def _to_gift_out(item, viewer_id: str) -> GiftItemOut:
    return GiftItemOut(
        id=item.id,
        gesture=item.gesture,
        description=item.description,
        status=item.status.value,
        direction="me" if item.giver_id == viewer_id else "them",
        i_am_giver=item.giver_id == viewer_id,
        created_at=item.created_at,
    )


async def _forbidden(_: object, __: object) -> HTTPException:
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="not a member of this pair")


async def _precondition(_: object, __: object) -> HTTPException:
    raise HTTPException(status.HTTP_412_PRECONDITION_FAILED, detail="pair up first")


async def _not_found(_: object, __: object) -> HTTPException:
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found")


app = create_app()
