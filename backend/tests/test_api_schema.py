"""API schema smoke test: Pydantic models accept both camelCase and snake_case.

This is a unit test on the schemas themselves (no DB, no FastAPI). It pins the
client/server contract so future renames break loudly.

The full route-level test runs in e2e/bot/test_pair_flow_e2e.py against the
repository layer (which the API just thinly wraps).
"""

from __future__ import annotations

from datetime import datetime

import pytest
from pairly.api.schemas import (
    BucketCreate,
    CountdownCreate,
    MoodSet,
    QOTDAnswerIn,
    WishlistCreate,
)


def test_wishlist_create_accepts_camel_case():
    m = WishlistCreate.model_validate({"title": "Кафе", "address": "Ленина 1", "category": "eat"})
    assert m.title == "Кафе"
    assert m.address == "Ленина 1"


def test_wishlist_create_accepts_snake_case():
    m = WishlistCreate.model_validate({"title": "Test", "notes": "x", "event_date": "2026-08-15"})
    assert m.title == "Test"
    assert m.notes == "x"


def test_countdown_create_accepts_camel_case():
    m = CountdownCreate.model_validate(
        {"label": "Годовщина", "targetDate": "2026-08-15T10:00:00Z", "emoji": "💛"}
    )
    assert m.label == "Годовщина"
    assert isinstance(m.target_date, datetime)


def test_countdown_create_accepts_snake_case():
    m = CountdownCreate.model_validate(
        {"label": "Test", "target_date": "2026-08-15T10:00:00Z"}
    )
    assert m.label == "Test"


def test_qotd_answer_in_accepts_answer_only():
    m = QOTDAnswerIn.model_validate({"answer": "Люблю"})
    assert m.answer == "Люблю"
    assert m.body is None


def test_qotd_answer_in_accepts_body_only():
    m = QOTDAnswerIn.model_validate({"body": "Люблю", "question_id": "q1"})
    assert m.body == "Люблю"
    assert m.question_id == "q1"


def test_mood_set_strips_whitespace():
    m = MoodSet.model_validate({"mood": "  хорошо  ", "note": "  "})
    assert m.mood == "хорошо"
    assert m.note is None  # empty after strip


def test_bucket_create_required_title():
    with pytest.raises(Exception):
        BucketCreate.model_validate({})


def test_wishlist_status_pattern_rejects_unknown():
    from pairly.api.schemas import WishlistStatusUpdate

    with pytest.raises(Exception):
        WishlistStatusUpdate.model_validate({"status": "what"})
