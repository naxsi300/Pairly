"""Pydantic request/response schemas for the API.

The Mini App client uses camelCase (JS convention); the backend stores snake_case
(Python convention). Each model accepts both — via Field(alias="...") for input +
Field(serialization_alias=...) for output — so the wire format is always camelCase
and the internal layer stays snake_case. With `populate_by_name=True`, the same
field accepts both casings on the way in.
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
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
    # Widths mirror the DB columns (WishlistItem.address String(512),
    # .category String(32), .notes Text). Capping at the API layer turns an
    # opaque Postgres DataError 500 (or a giant insert used as DoS) into a
    # clean Pydantic 422. notes is Text in the DB; 2000 is a sane cap that
    # keeps room for forwarded-posts commentary without unbounded inserts.
    address: str | None = Field(default=None, max_length=512)
    category: str | None = Field(default=None, max_length=32)
    notes: str | None = Field(default=None, max_length=2000)
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
    # True when a forwarded photo's file_id was captured; the Mini App resolves the
    # image on demand via GET /api/wishlist/{id}/photo (which 302s to a Telegram URL).
    telegram_file_id: str | None = None
    has_photo: bool = False
    # Deep link to the original forwarded Telegram post (https://t.me/...).
    source_url: str | None = None
    # True when the caller authored this item (used by two-tap: only the partner
    # sees the approve button). Set by the API at serialization time.
    mine: bool = False

    @model_validator(mode="before")
    @classmethod
    def _derive_has_photo(cls, data: object) -> object:
        """Set has_photo from a truthy telegram_file_id (model or dict input)."""
        if isinstance(data, dict):
            data["has_photo"] = bool(data.get("telegram_file_id"))
        else:
            # SQLAlchemy model instance — read the attribute.
            data = {
                "id": data.id,
                "title": data.title,
                "address": data.address,
                "category": data.category,
                "status": data.status.value if hasattr(data.status, "value") else data.status,
                "notes": data.notes,
                "event_date": data.event_date,
                "telegram_file_id": data.telegram_file_id,
                "has_photo": bool(data.telegram_file_id),
                "source_url": getattr(data, "source_url", None),
            }
        return data

    model_config = {"populate_by_name": True}


class DateIdeaOut(_CamelModel):
    """Result of spinning the date-wheel."""
    source: str  # "wishlist" | "default"
    title: str
    category: str | None = None
    reason: str = ""  # warm "why this for you" line


class LoveNoteCreate(_CamelModel):
    body: str = Field(min_length=1, max_length=1000)
    # optional 'HH:MM' delivery hint; validated so the future scheduler can't choke.
    deliver_at: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class LoveNoteOut(_CamelModel):
    id: str
    body: str
    deliver_at: str | None = None
    mine: bool = False  # True if the caller authored it
    read_by_recipient: bool = False
    created_at: datetime


# --- Bucket ---

class BucketCreate(_CamelModel):
    title: str = Field(min_length=1, max_length=256)
    # BucketItem.note is Text in the DB; cap at 2000 so a buggy client (or a
    # malicious one) gets a clean 422 instead of an unbounded insert.
    note: str | None = Field(default=None, max_length=2000)
    # BucketItem.category is String(32) in the DB — cap here for a clean 422
    # instead of an opaque DB DataError 500.
    category: str | None = Field(default=None, max_length=32)


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
    # Countdown.emoji is String(32) in the DB (widened by migration 0011 to fit
    # up to 4 grapheme clusters — a ZWJ family is 1 grapheme but 11 code points).
    # Mirror the column width at the API layer for a clean 422.
    emoji: str | None = Field(default=None, max_length=32)
    # 'annual'/'monthly' roll forward conceptually; 'milestone' marks a reference
    # date (e.g. дата знакомства) whose round anniversaries are synthesized client-side.
    recurrence: Literal["annual", "monthly", "milestone"] | None = None


class CountdownOut(_CamelModel):
    id: str
    label: str
    emoji: str | None = None
    # Serialized as `targetDate` to match the Mini App client (which already
    # accepts both casings on input via the matching CountdownCreate alias).
    target_date: datetime | None = Field(default=None, serialization_alias="targetDate")
    recurrence: str | None = None


class CountdownUpdate(_CamelModel):
    """Partial update — only fields the client sends are applied (exclude_unset).
    A field explicitly sent as null (e.g. recurrence) clears it."""

    label: str | None = Field(default=None, min_length=1, max_length=128)
    target_date: datetime | None = Field(default=None, alias="targetDate", validation_alias="targetDate")
    # Mirror CountdownCreate — Countdown.emoji is String(32) (migration 0011).
    emoji: str | None = Field(default=None, max_length=32)
    recurrence: Literal["annual", "monthly", "milestone"] | None = None


# --- Mood ---

class MoodSet(_CamelModel):
    mood: str
    # MoodEntry.note is String(60) in the DB and the repo truncates to 60 chars;
    # cap at the API layer so callers get a clean 422 instead of a silent truncate
    # (or, on Postgres, an opaque DataError 500).
    note: str | None = Field(default=None, max_length=60)

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
    # Cap at ANSWER_MAX_CHARS (280, see repositories/qotd.py) so the API rejects
    # oversized input with a clean 422 instead of letting it hit the DB and raise
    # an opaque Postgres DataError 500 (QOTDAnswer.body is String(300) — ~280 + slack).
    answer: str | None = Field(default=None, max_length=280)
    body: str | None = Field(default=None, max_length=280)
    question_id: str | None = None


class QOTDArchiveOut(_CamelModel):
    """One row in the answered-Q&A archive (history sheet).

    `date` is the UTC-day bucket — same-day re-answers collapse into a single
    row. `my_answer` is the viewer's body and `partner_answer` is the partner's
    body for that (pair, question, day). Both bodies are unconditionally visible
    here (no reveal gate — this is the read-only history).
    """

    date: datetime
    question_text: str
    my_answer: str
    partner_answer: str


# --- Gifts ---

class GiftCreate(_CamelModel):
    gesture: str = Field(min_length=1, max_length=256)
    # GiftItem.description is Text in the DB; cap at 1000 (tighter than
    # wishlist notes — the gift card surface is shorter). Stops unbounded
    # inserts before they hit the DB.
    description: str | None = Field(default=None, max_length=1000)


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
    is_pro: bool = Field(default=False, alias="isPro", serialization_alias="isPro")


class GiftsResponse(_CamelModel):
    items: list[GiftItemOut] = []
    partner_name: str | None = None


# --- Profile / settings ---

class MeOut(_CamelModel):
    """The caller's own profile + pair info.

    Used by GET /api/me and PATCH /api/me (same shape). pairCreatedAt and
    partnerDisplayName are null for unpaired callers — the endpoint does NOT
    412 on /api/me (unlike shared-feature endpoints); profile is always
    readable.
    """

    id: str
    display_name: str | None = None
    tg_username: str | None = None
    pair_created_at: datetime | None = None
    partner_display_name: str | None = None


class MePatch(_CamelModel):
    """PATCH /api/me body — only fields the client actually wants to update.

    All fields are optional; omitting a field leaves it untouched on the server.
    Truncation / non-empty checks live in the route, not the schema (so the
    test can read the raw value pre-trim).
    """

    display_name: str | None = None
