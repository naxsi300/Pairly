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

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.api.schemas import (
    BucketCreate,
    BucketItemOut,
    BucketStatusUpdate,
    CountdownCreate,
    CountdownOut,
    GiftCreate,
    GiftItemOut,
    GiftsResponse,
    GiftTransition,
    MilestoneOut,
    MoodEntryOut,
    MoodResponse,
    MoodSet,
    QOTDAnswerIn,
    QOTDAnswerOut,
    QOTDQuestionOut,
    QOTDResponse,
    WishlistCreate,
    WishlistItemOut,
    WishlistStatusUpdate,
)
from pairly.auth import AuthContext, current_auth
from pairly.db.base import get_session
from pairly.db.models import GiftStatus
from pairly.repositories import bucket, countdowns, gifts, milestones, mood, qotd, wishlist
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
    app = FastAPI(title="Pairly Mini App API", version="0.1.0")

    app.add_exception_handler(PairAccessError, _forbidden)
    app.add_exception_handler(NotPairedError, _precondition)
    app.add_exception_handler(LookupError, _not_found)

    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # --- wishlist ---
    @app.get("/api/wishlist", response_model=list[WishlistItemOut])
    async def get_wishlist(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[WishlistItemOut]:
        pair_id = _require_pair(auth)
        items = await wishlist.list_items(session, pair_id=pair_id, user_id=auth.user.id)
        return [WishlistItemOut.model_validate(i) for i in items]

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
    ) -> MoodEntryOut:
        pair_id = _require_pair(auth)
        try:
            entry = await mood.set_mood(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                mood=payload.mood,
                note=payload.note,
            )
            await session.commit()
        except InvalidMoodError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        from pairly.bot.notify import notify_mood_set

        await notify_mood_set(
            session, pair_id=pair_id, actor_id=auth.user.id, mood=entry.mood
        )
        return _to_mood_out(entry)

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
        from pairly.bot.notify import notify_qotd_answered

        await notify_qotd_answered(session, pair_id=pair_id, actor_id=auth.user.id)
        # After answering, the caller has cleared the reveal gate — recompute the
        # partner's state for THIS caller and return the client's flat shape so the
        # UI can spread it straight into its QOTDState.
        p_answered = await qotd.partner_has_answered(
            session, pair_id=pair_id, user_id=auth.user.id, question_id=question_id
        )
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
        # When a gift is marked done, the receiver learns it actually happened.
        if item.status == GiftStatus.REDEEMED:
            from pairly.bot.notify import notify_gift_redeemed

            await notify_gift_redeemed(
                session, pair_id=pair_id, actor_id=auth.user.id, gesture=item.gesture
            )
        return _to_gift_out(item, auth.user.id)

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
