"""FastAPI Mini App API — separate process from the bot, mounted at /api/*.

Auth: Telegram WebApp initData HMAC (production) or X-Dev-User-Id header (dev/test,
gated by PAIRLY_DEV_AUTH=1). The user is resolved on every request; pair_id is read
from the User row.

All DB writes go through the repository layer (pair-scoped). The API never bypasses it.
Every route resolves membership through the repos, which raise PairAccessError on a
non-member — mapped to 403 below. Unpaired users get 412 ("pair up first").
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from pairly.auth import AuthContext, current_auth
from pairly.db.base import get_session
from pairly.db.models import GiftStatus
from pairly.repositories import bucket, countdowns, gifts, mood, qotd, wishlist
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


def create_app() -> FastAPI:
    app = FastAPI(title="Pairly Mini App API", version="0.1.0")

    app.add_exception_handler(PairAccessError, _forbidden)
    app.add_exception_handler(NotPairedError, _precondition)
    app.add_exception_handler(LookupError, _not_found)

    # --- health ---
    @app.get("/api/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    # --- wishlist ---
    @app.get("/api/wishlist")
    async def get_wishlist(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[dict[str, Any]]:
        pair_id = _require_pair(auth)
        items = await wishlist.list_items(session, pair_id=pair_id, user_id=auth.user.id)
        return [_wishlist_dict(i) for i in items]

    @app.post("/api/wishlist")
    async def post_wishlist(
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        pair_id = _require_pair(auth)
        try:
            item = await wishlist.create_item(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                title=payload["title"],
                address=payload.get("address"),
                category=payload.get("category"),
            )
            await session.commit()
        except WishlistLimitError as exc:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
        return _wishlist_dict(item)

    @app.post("/api/mark-done")
    async def mark_done(
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        return await _wishlist_set_status(
            session, auth, payload["item_id"], "done"
        )

    @app.post("/api/wishlist/{item_id}/status")
    async def wishlist_status(
        item_id: str,
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        return await _wishlist_set_status(
            session, auth, item_id, payload["status"]
        )

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
    @app.get("/api/bucket")
    async def get_bucket(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[dict[str, Any]]:
        pair_id = _require_pair(auth)
        items = await bucket.list_items(session, pair_id=pair_id, user_id=auth.user.id)
        return [_bucket_dict(i) for i in items]

    @app.post("/api/bucket")
    async def post_bucket(
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        pair_id = _require_pair(auth)
        try:
            item = await bucket.create_item(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                title=payload["title"],
                note=payload.get("note"),
                category=payload.get("category"),
            )
            await session.commit()
        except BucketLimitError as exc:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
        return _bucket_dict(item)

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
    @app.get("/api/countdowns")
    async def get_countdowns(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[dict[str, Any]]:
        pair_id = _require_pair(auth)
        items = await countdowns.list_items(session, pair_id=pair_id, user_id=auth.user.id)
        return [_countdown_dict(i) for i in items]

    @app.post("/api/countdowns")
    async def post_countdowns(
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        pair_id = _require_pair(auth)
        try:
            item = await countdowns.create_item(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                label=payload["label"],
                target_date=_parse_dt(payload["target_date"]),
                emoji=payload.get("emoji"),
                recurrence=payload.get("recurrence"),
            )
            await session.commit()
        except CountdownLimitError as exc:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, detail=str(exc)) from exc
        return _countdown_dict(item)

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
    @app.get("/api/mood")
    async def get_mood(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        pair_id = _require_pair(auth)
        moods = await mood.current_moods(session, pair_id=pair_id, user_id=auth.user.id)
        return {
            "mine": _mood_dict(moods.get(auth.user.id)),
            "partner": _mood_dict(next((v for k, v in moods.items() if k != auth.user.id), None)),
        }

    @app.post("/api/mood")
    async def post_mood(
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        pair_id = _require_pair(auth)
        try:
            entry = await mood.set_mood(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                mood=payload["mood"],
                note=payload.get("note"),
            )
            await session.commit()
        except InvalidMoodError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return _mood_dict(entry)

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
    @app.get("/api/qotd")
    async def get_qotd(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        """Returns today's question + the reveal-gated view.

        `mine` is present if the caller answered; `partner` is present ONLY if the caller
        answered (the hard gate). The client must never show `partner` without `mine`.
        Unpaired users get 412 (no question, no pair).
        """
        pair_id = _require_pair(auth)
        question = await qotd.todays_question(session)
        if question is None:
            return {"question": None, "mine": None, "partner": None}
        mine = await qotd.my_answer(
            session, pair_id=pair_id, user_id=auth.user.id, question_id=question.id
        )
        partner = await qotd.partner_answer(
            session, pair_id=pair_id, user_id=auth.user.id, question_id=question.id
        )
        return {
            "question": {"id": question.id, "text": question.text, "category": question.category},
            "mine": _answer_dict(mine),
            "partner": _answer_dict(partner),
        }

    @app.post("/api/qotd/answer")
    async def post_qotd(
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        pair_id = _require_pair(auth)
        try:
            answer = await qotd.post_answer(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                question_id=payload["question_id"],
                body=payload["body"],
            )
            await session.commit()
        except AnswerTooLongError as exc:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST, detail=f"answer too long: {exc}"
            ) from exc
        except ValueError as exc:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
        return _answer_dict(answer)

    # --- gifts ---
    @app.get("/api/gifts")
    async def get_gifts(
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> list[dict[str, Any]]:
        pair_id = _require_pair(auth)
        items = await gifts.list_gifts(session, pair_id=pair_id, user_id=auth.user.id)
        return [_gift_dict(i, auth.user.id) for i in items]

    @app.post("/api/gifts")
    async def post_gifts(
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        pair_id = _require_pair(auth)
        item = await gifts.create_gift(
            session,
            pair_id=pair_id,
            giver_id=auth.user.id,
            gesture=payload["gesture"],
            description=payload.get("description"),
        )
        await session.commit()
        return _gift_dict(item, auth.user.id)

    @app.post("/api/gifts/{gift_id}/transition")
    async def gift_transition(
        gift_id: str,
        payload: dict[str, Any],
        auth: AuthContext = Depends(current_auth),
        session: AsyncSession = Depends(get_session),
    ) -> dict[str, Any]:
        pair_id = _require_pair(auth)
        try:
            item = await gifts.transition(
                session,
                pair_id=pair_id,
                user_id=auth.user.id,
                gift_id=gift_id,
                to=GiftStatus(payload["status"]),
            )
            await session.commit()
        except GiftStateError as exc:
            raise HTTPException(status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        return _gift_dict(item, auth.user.id)

    return app


# --- helpers ------------------------------------------------------------------


async def _wishlist_set_status(
    session: AsyncSession, auth: AuthContext, item_id: str, status_str: str
) -> dict[str, Any]:
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
    return _wishlist_dict(item)


def _parse_dt(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="bad date") from exc


def _wishlist_dict(item: Any) -> dict[str, Any]:
    return {
        "id": item.id, "title": item.title, "address": item.address,
        "category": item.category, "status": item.status.value,
    }


def _bucket_dict(item: Any) -> dict[str, Any]:
    return {
        "id": item.id, "title": item.title, "note": item.note,
        "category": item.category, "status": item.status.value,
    }


def _countdown_dict(item: Any) -> dict[str, Any]:
    return {
        "id": item.id, "label": item.label, "emoji": item.emoji,
        "target_date": item.target_date.isoformat() if item.target_date else None,
        "recurrence": item.recurrence,
    }


def _mood_dict(entry: Any) -> dict[str, Any] | None:
    if entry is None:
        return None
    return {"mood": entry.mood, "note": entry.note, "set_at": entry.set_at.isoformat()}


def _answer_dict(answer: Any) -> dict[str, Any] | None:
    if answer is None:
        return None
    return {"body": answer.body, "answered_at": answer.answer_date.isoformat()}


def _gift_dict(item: Any, viewer_id: str) -> dict[str, Any]:
    return {
        "id": item.id, "gesture": item.gesture, "description": item.description,
        "status": item.status.value,
        "i_am_giver": item.giver_id == viewer_id,
        "created_at": item.created_at.isoformat(),
    }


async def _forbidden(_: Any, __: Any) -> HTTPException:
    raise HTTPException(status.HTTP_403_FORBIDDEN, detail="not a member of this pair")


async def _precondition(_: Any, __: Any) -> HTTPException:
    raise HTTPException(status.HTTP_412_PRECONDITION_FAILED, detail="pair up first")


async def _not_found(_: Any, __: Any) -> HTTPException:
    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="not found")


app = create_app()
