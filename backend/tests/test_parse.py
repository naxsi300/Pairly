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


# --- Smarter title selection (forwarding-fix) ---------------------------------
# A forwarded channel post usually has a URL / @handle / price / emoji banner as
# line 1. The real title is on a later line. The parser must skip junk leading
# lines and pick the first "title-like" line.

def test_skips_leading_tme_url_to_find_title():
    text = "https://t.me/afisha/1234\nДжаз-вечер в «Союз Композиторов»\n23 ноября, 20:00"
    parsed = parse_forwarded_text(text)
    assert parsed.title == "Джаз-вечер в «Союз Композиторов»"


def test_skips_leading_channel_handle():
    text = "@restochannel\nПиццерия «Дора» на Патриарших\nул. Спиридоновка 14"
    parsed = parse_forwarded_text(text)
    assert parsed.title == "Пиццерия «Дора» на Патриарших"


def test_skips_leading_price_line():
    text = "🔥 1 990 ₽\nКонцерт в клубе «Союз»\n12 июля в 19:00"
    parsed = parse_forwarded_text(text)
    assert parsed.title == "Концерт в клубе «Союз»"


def test_skips_pure_emoji_banner_line():
    text = "🎷🎶\nДжазовый квартет в эту субботу\nЦентр, 20:00"
    parsed = parse_forwarded_text(text)
    assert parsed.title == "Джазовый квартет в эту субботу"


def test_keeps_short_real_title_when_no_junk():
    # No junk prefix — a plain title must survive unchanged (not be mistaken
    # for a price just because it has a digit).
    text = "Поход в ТЦ Авиапарк\nзавтра вечером"
    parsed = parse_forwarded_text(text)
    assert parsed.title == "Поход в ТЦ Авиапарк"


def test_all_lines_are_junk_falls_back_to_first():
    # If every line looks like junk, fall back to line 1 rather than None —
    # better an editable guess than an empty title that blocks saving.
    text = "https://t.me/x/1\nhttps://t.me/x/2"
    parsed = parse_forwarded_text(text)
    assert parsed.title == "https://t.me/x/1"
