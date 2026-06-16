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


class _CamelModel(BaseModel):
    """Base: accept both casings, serialize as camelCase."""

    model_config = ConfigDict(
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
    """Body for /api/wishlist/{id}/status. POST /api/mark-done uses item_id instead."""

    status: str = Field(pattern="^(open|planned|done|archived)$")
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
    target_date: datetime | None = None
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
    mine: MoodEntryOut | None = None
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
    question: QOTDQuestionOut | None = None
    mine: QOTDAnswerOut | None = None
    partner: QOTDAnswerOut | None = None
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


class GiftsResponse(_CamelModel):
    items: list[GiftItemOut] = []
    partner_name: str | None = None
