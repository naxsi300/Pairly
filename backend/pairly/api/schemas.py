"""Pydantic request/response schemas for the API.

The Mini App client uses camelCase (JS convention); the backend stores snake_case
(Python convention). Each model accepts both — via Field(alias="...") for input +
Field(serialization_alias=...) for output — so the wire format is always camelCase
and the internal layer stays snake_case. With `populate_by_name=True`, the same
field accepts both casings on the way in.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel


def _to_camel(name: str) -> str:
    """snake_case -> camelCase (e.g. set_at -> setAt, partner_name -> partnerName)."""
    return to_camel(name)


class _CamelModel(BaseModel):
    """Base: accept both casings (populate_by_name), serialize as camelCase.

    The `alias_generator` makes EVERY field emit camelCase on output via
    `model_dump(by_alias=True)` AND when FastAPI serializes a `response_model=`
    (FastAPI honours the alias generator automatically for response models).
    On input, `populate_by_name=True` lets both snake_case and camelCase keys in.
    """

    model_config = ConfigDict(
        alias_generator=_to_camel,
        populate_by_name=True,
        from_attributes=True,
        str_strip_whitespace=True,
    )


# --- Wishlist ---

class WishlistCreate(_CamelModel):
    title: str = Field(min_length=1, max_length=256)
    address: str | None = None
    category: str | None = None
    notes: str | None = None
    event_date: datetime | None = None


class WishlistStatusUpdate(_CamelModel):
    """Body for /api/wishlist/{id}/status. POST /api/mark-done uses item_id instead.

    `status` defaults to "done" — the `/api/mark-done` endpoint treats absence
    of status as "mark this as done" (item_id is the identifier).
    """

    status: str = Field(default="done", pattern="^(open|planned|done|archived)$")
    item_id: str | None = None  # only for /api/mark-done


class WishlistItemOut(_CamelModel):
    id: str
    title: str
    address: str | None = None
    category: str | None = None
    status: str
    notes: str | None = None
    event_date: datetime | None = None


# --- Bucket ---

class BucketCreate(_CamelModel):
    title: str = Field(min_length=1, max_length=256)
    note: str | None = None
    category: str | None = None


class BucketStatusUpdate(_CamelModel):
    status: str = Field(pattern="^(dreaming|planning|done)$")


class BucketItemOut(_CamelModel):
    id: str
    title: str
    note: str | None = None
    category: str | None = None
    status: str
    completed_at: datetime | None = None


# --- Countdowns ---

class CountdownCreate(_CamelModel):
    label: str = Field(min_length=1, max_length=128)
    # The Mini App client uses `targetDate` (camelCase); Pydantic with
    # populate_by_name=True needs the field to know both names.
    target_date: datetime = Field(alias="targetDate", validation_alias="targetDate")
    emoji: str | None = None
    recurrence: str | None = None


class CountdownOut(_CamelModel):
    id: str
    label: str
    emoji: str | None = None
    # Serialized as `targetDate` to match the Mini App client (which already
    # accepts both casings on input via the matching CountdownCreate alias).
    target_date: datetime | None = Field(default=None, serialization_alias="targetDate")
    recurrence: str | None = None


# --- Mood ---

class MoodSet(_CamelModel):
    mood: str
    note: str | None = None

    @field_validator("mood", "note", mode="before")
    @classmethod
    def _strip_or_none(cls, v):
        if v is None:
            return None
        v = v.strip()
        return v or None


class MoodEntryOut(_CamelModel):
    mood: str
    note: str | None = None
    set_at: datetime | None = None


class MoodResponse(_CamelModel):
    # Client shape (miniapp/src/sdk/api.ts + screens/Mood.tsx): `self`/`partner`.
    self_entry: MoodEntryOut | None = Field(default=None, alias="self")
    partner: MoodEntryOut | None = None
    partner_name: str | None = None


# --- QOTD ---

class QOTDQuestionOut(_CamelModel):
    id: str
    text: str
    category: str


class QOTDAnswerOut(_CamelModel):
    body: str
    answered_at: datetime | None = None


class QOTDResponse(_CamelModel):
    """Client shape (miniapp/src/types.ts QOTDState): flat, not nested.

    myAnswer/partnerAnswer are plain strings (or null). partnerAnswered is a bool
    the UI gates on. The reveal-gate invariant is STILL enforced server-side in the
    repository (partner_answer returns None until the caller has answered) — this
    schema just flattens the result for the client.
    """

    question: QOTDQuestionOut | None = None
    my_answer: str | None = None
    partner_answered: bool = False
    partner_answer: str | None = None
    partner_name: str | None = None


class QOTDAnswerIn(_CamelModel):
    # The client posts { answer: "..." } but the server needs question_id from
    # today's question. Accept both shapes; if no question_id, the server picks
    # today's question (cheaper client). Also accepts body + question_id.
    answer: str | None = None
    body: str | None = None
    question_id: str | None = None


# --- Gifts ---

class GiftCreate(_CamelModel):
    gesture: str = Field(min_length=1, max_length=256)
    description: str | None = None


class GiftTransition(_CamelModel):
    status: str = Field(
        pattern="^(received|claimed|declined|redeemed|complete|archived)$"
    )


class GiftItemOut(_CamelModel):
    id: str
    gesture: str
    description: str | None = None
    status: str
    # The Mini App client uses `direction: "me"|"them"`. We compute it from
    # i_am_giver (the auth user is the giver) and i_am_giver is exposed too
    # for clients that prefer a boolean.
    direction: str | None = None
    i_am_giver: bool = False
    created_at: datetime | None = None


class MilestoneOut(_CamelModel):
    """A soft milestone the pair has just reached (e.g. 5 wishlist items).
    The Mini App may show a one-shot celebratory toast; it MUST NOT persist this
    to a visible history or compare counts across pairs."""

    kind: str  # "wishlist_count" | "countdown_count" | "qotd_count" | "gift_count"
    value: int  # threshold crossed (e.g. 5)


class WishlistCreateOut(WishlistItemOut):
    """WishlistCreate response: item + any newly-crossed milestones for a toast."""

    new_milestones: list[MilestoneOut] = []


class PairStats(_CamelModel):
    """Ambient shared counters — warm, non-competitive, no streaks/XP/leaderboards.
    Rendered in the Mini App as a gentle stats card, not a dashboard with goals."""

    together_days: int = 0
    total_wishlist: int = 0
    wishlist_done: int = 0
    total_gifts: int = 0
    gifts_completed: int = 0
    total_qotd_answers: int = 0
    total_countdowns: int = 0
    created_at: datetime | None = None  # pair.created_at for "since" displays


class GiftsResponse(_CamelModel):
    items: list[GiftItemOut] = []
    partner_name: str | None = None
