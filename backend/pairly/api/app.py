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

from fastapi import Depends, FastAPI, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.api.schemas import (
    BucketCreate,
    BucketItemOut,
    BucketStatusUpdate,
    CountdownCreate,
    CountdownOut,
    CountdownUpdate,
    GiftCreate,
    GiftItemOut,
    GiftsResponse,
    GiftTransition,
    MilestoneOut,
    MoodEntryOut,
    MoodResponse,
    MoodSet,
    DateIdeaOut,
    LoveNoteCreate,
    LoveNoteOut,
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
from pairly.db.models import GiftStatus
from pairly.repositories import bucket, countdowns, gifts, milestones, mood, qotd, wishlist
from pairly.repositories import love_notes
from pairly.repositories.base import NotPairedError, PairAccessError
from pairly.repositories.bucket import BucketLimitError
from pairly.repositories.countdowns import CountdownLimitError
from pairly.repositories.gifts import GiftStateError
from pairly.repositories.mood import InvalidMoodError
from pairly.repositories.qotd import AnswerTooLongError
from pairly.repositories.wishlist import WishlistLimitError


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


def create_app() -> FastAPI:
    # Boot guard: dev-auth (PAIRLY_DEV_AUTH=1) is a full unauthenticated impersonation
    # of any user via X-Dev-User-Id — it MUST NOT be reachable on a public bind.
    # Fail fast at import rather than serving an open bypass to the internet.
    settings = get_settings()
    if settings.dev_auth and settings.api_host not in ("127.0.0.1", "localhost", "::1"):
        raise RuntimeError(
            "PAIRLY_DEV_AUTH=1 refuses to run on a public bind "
            f"(api_host={settings.api_host!r}). Set PAIRLY_DEV_AUTH=0 or bind loopback."
        )

    app = FastAPI(title="Pairly Mini App API", version="0.1.0")

    app.add_exception_handler(PairAccessError, _forbidden)
    app.add_exception_handler(NotPairedError, _precondition)
    app.add_exception_handler(LookupError, _not_found)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # --- pair stats (ambient shared-counters, not goals/streaks) ---
    @app.get("/api/pair/stats", response_model=PairStats)
    async def pair_stats(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> PairStats:
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
        init_data: str = "",
        dev_user_id: str = "",
        session: AsyncSession = Depends(get_session),
    ) -> Response:
        """Resolve a forwarded photo on demand and 302 to Telegram's temp file URL.

        ``<img src>`` cannot send the X-Telegram-Init-Data header, so auth here is
        via the ``init_data`` (or ``dev_user_id`` in dev) query param — the same
        HMAC initData the client already sends as a header on every other request
        (equivalent threat model; initData is itself short-lived). Membership is
        still enforced: the item must belong to the caller's pair.

        Returns 204 when the item has no photo, 404 when absent, 502 if Telegram
        declines the lookup — best-effort, the <img> just stays empty.
        """
        from fastapi.responses import RedirectResponse

        from pairly.auth import resolve_init_data
        from pairly.bot.notify import _get_bot

        auth = await resolve_init_data(init_data, session, dev_user_id=dev_user_id)
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
        # aiogram builds the absolute temp-file URL from the bot token + path.
        url = bot.session.api.file_url(bot.token, file.file_path)
        return RedirectResponse(url=str(url), status_code=302)

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
            session, pair_id=pair_id, category=category, mode=mode, user_id=auth.user.id
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
            session, pair_id=pair_id, actor_id=auth.user.id, body=note.body
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
        try:
            item = await wishlist.approve_item(
                session, pair_id=pair_id, user_id=auth.user.id, item_id=item_id
            )
        except LookupError as exc:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="item not found") from exc
        await session.commit()
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
        out = WishlistItemOut.model_validate(item).model_dump(by_alias=True)
        out["newMilestones"] = [
            MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True) for m in new_ms
        ]
        return out

    @app.post("/api/mark-done", response_model=WishlistItemOut)
    async def mark_done(
        payload: WishlistStatusUpdate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> WishlistItemOut:
        return await _wishlist_set_status(session, auth, payload.item_id, "done")

    @app.post("/api/wishlist/{item_id}/status", response_model=WishlistItemOut)
    async def wishlist_status(
        item_id: str,
        payload: WishlistStatusUpdate,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> WishlistItemOut:
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

    @app.post("/api/mood", response_model=MoodEntryOut)
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
        # Notification beat: if BOTH have now answered, send the mutual reveal line
        # (meta-only — never the body). Otherwise a soft single ping (cooldown-gated).
        if p_answered:
            from pairly.bot.notify import notify_qotd_mutual

            await notify_qotd_mutual(session, pair_id=pair_id, actor_id=auth.user.id)
        else:
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

    @app.post("/api/gifts/{gift_id}/transition", response_model=GiftItemOut)
    async def gift_transition(
        gift_id: str,
        payload: GiftTransition,
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> GiftItemOut:
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
            if new_ms_c:
                out_ms = [
                    MilestoneOut(kind=m.kind, value=m.value).model_dump(by_alias=True)
                    for m in new_ms_c
                ]
                result = _to_gift_out(item, auth.user.id).model_dump(by_alias=True)
                result["newMilestones"] = out_ms
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
        return _to_gift_out(item, auth.user.id)

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
        from pairly.db.models import User
        from sqlalchemy import select as _select

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
) -> WishlistItemOut:
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
    return WishlistItemOut.model_validate(item)


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
