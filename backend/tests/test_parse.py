"""Forward parser smoke tests."""

from __future__ import annotations

from pairly.bot.parse import parse_forwarded_text


def test_extracts_title_address_category():
    text = "Уютная пиццерия на углу\nул. Ленина 10, метро Парк\nЖдём вас 12 июля в 19:00"
    parsed = parse_forwarded_text(text)
    assert parsed.title == "Уютная пиццерия на углу"
    assert parsed.address is not None and "Ленина" in parsed.address
    assert parsed.category == "eat"
    assert parsed.date_hint is not None
    assert parsed.time_hint == "19:00"


def test_empty_text_returns_none_title():
    parsed = parse_forwarded_text("")
    assert parsed.title is None
    assert parsed.category is None


def test_defaults_category_to_do():
    parsed = parse_forwarded_text("Какая-то непонятная ссылка без ключевых слов")
    assert parsed.category == "do"
