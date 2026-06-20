"""Heuristic parser for forwarded posts -> wishlist fields.

Deliberately simple (regex/keywords). Not an NLP project — the user can edit any field.
Extracts: title (first non-empty line), optional address (heuristic), optional date,
optional category (keyword match). Empty results are fine; the bot asks for a title.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from pairly.bot.text import truncate_graphemes

# Category keyword banks (Russian + common English). Matched against lowercased text.
_CATEGORY_KEYWORDS: dict[str, tuple[str, ...]] = {
    "eat": (
        "ресторан", "кафе", "бар", "поесть", "ужин", "еда", "кофейня", "пекарня",
        "пиццерия", "пицца", "суши", "бургер", "restaurant",
    ),
    "do": ("выставка", "концерт", "спектакль", "квест", "прогулка", "событие", "exhibition", "concert"),
    "stay": ("отель", "гостиница", "турбаза", "ночевка", "hotel", "airbnb"),
    "watch": ("кино", "фильм", "сериал", "спектакль", "movie", "film"),
    "buy": ("купить", "магазин", "покупка", "заказать", "shop", "buy"),
}

# Loose date patterns: "12 июля", "12.07", "2025-07-12", "23 августа в 19:00".
_DATE_PATTERNS = (
    r"\b(\d{1,2}\s+[а-яё]{3,8}(?:\s+\d{4})?)\b",
    r"\b(\d{1,2}[./-]\d{1,2}(?:[./-]\d{2,4})?)\b",
    r"\b(\d{4}-\d{2}-\d{2})\b",
)
_TIME_PATTERN = r"\b(\d{1,2}:\d{2})\b"

# Address heuristics: "ул.", "улица", "пр.", "проспект", "пер.", "д.", "метро".
_ADDR_PATTERN = r"(ул\.?|улица|пр\.?|проспект|пер\.?|переулок|шоссе|ш\.|метро)\s+[А-Яа-яЁё][\wА-Яа-яЁё.\-\s]{2,40}"


@dataclass(slots=True)
class ParsedPost:
    title: str | None
    address: str | None
    date_hint: str | None  # raw matched string; parsing to datetime is the bot's job
    time_hint: str | None
    category: str | None


# --- Title selection ----------------------------------------------------------
# A forwarded Telegram channel post usually opens with a "junk" line that is NOT
# the real title: a t.me link, the @channel handle, a price banner ("🔥 1 990 ₽"),
# or a pure-emoji header. The actual title is typically the first line that reads
# like a human title. We skip junk leading lines; if everything looks like junk,
# we fall back to line 1 (an editable guess beats a blank title that blocks save).

# Lines we treat as "not a title" when they appear at the top of the post.
_URL_RE = re.compile(r"^https?://\S+$", re.IGNORECASE)
_HANDLE_RE = re.compile(r"^@[A-Za-z0-9_]{3,}$")
# Pure-emoji / decorative banner (only emoji & punctuation, no word chars).
_EMOJI_BANNER_RE = re.compile(r"^[\W\D\s]+$")
# Price-like banner: emoji/symbol prefix then a number with currency glyph.
_PRICE_RE = re.compile(r"^[\W\d\s]*\d[\d\s.,]*\s*(₽|\$|€|₸|£|руб)\.?\s*$", re.IGNORECASE)


def _looks_like_junk_title(line: str) -> bool:
    """True if a leading line is probably NOT the post's real title."""
    if not line:
        return True
    if _URL_RE.match(line) or _HANDLE_RE.match(line):
        return True
    if _PRICE_RE.match(line):
        return True
    # EMOJI_BANNER must not match real words (contains a letter/digit) and must
    # actually contain something (avoid treating "" — already handled — as banner).
    if not re.search(r"[A-Za-zА-Яа-яЁё0-9]", line) and _EMOJI_BANNER_RE.match(line):
        return True
    return False


def _pick_title(lines: list[str]) -> str | None:
    """First title-like line; falls back to line 1 if all lines look like junk."""
    if not lines:
        return None
    for ln in lines:
        if not _looks_like_junk_title(ln):
            return truncate_graphemes(ln, 256)
    return truncate_graphemes(lines[0], 256)


def parse_forwarded_text(text: str) -> ParsedPost:
    """Best-effort parse. Never raises; missing fields -> None."""
    if not text or not text.strip():
        return ParsedPost(title=None, address=None, date_hint=None, time_hint=None, category=None)

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    title = _pick_title(lines)

    lowered = text.lower()
    category = None
    for cat, kws in _CATEGORY_KEYWORDS.items():
        if any(kw in lowered for kw in kws):
            category = cat
            break
    if category is None:
        category = "do"  # default per user-stories

    address_match = re.search(_ADDR_PATTERN, text, re.IGNORECASE)
    address = address_match.group(0).strip() if address_match else None

    date_hint = None
    for pat in _DATE_PATTERNS:
        m = re.search(pat, lowered)
        if m:
            date_hint = m.group(1)
            break

    time_match = re.search(_TIME_PATTERN, text)
    time_hint = time_match.group(1) if time_match else None

    return ParsedPost(title=title, address=address, date_hint=date_hint, time_hint=time_hint, category=category)
