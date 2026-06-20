"""Grapheme-aware truncation helper.

Python ``str[:N]`` slices by code point, splitting grapheme clusters mid-cluster
(family ZWJ, skin-tone modifiers, flag regional indicators, etc.). This module
exposes ``truncate_graphemes`` and is used by parse, mood, and love-notes
repositories to bound user-facing text fields safely.
"""

from __future__ import annotations

from pairly.bot.text import truncate_graphemes


# Family emoji: man + woman + girl + boy, joined by ZWJ. 7 code points (4 emoji
# + 3 ZWJ). Counts as a single grapheme cluster.
_FAMILY_EMOJI = "\U0001F468‍\U0001F469‍\U0001F467‍\U0001F466"
# Thumbs-up with light skin tone: base + skin-tone modifier.
_THUMBS_TONE = "\U0001F44D\U0001F3FB"
# Rainbow flag: base + variation selector-16.
_RAINBOW_FLAG = "\U0001F3F3️‍\U0001F308"
# Russia flag = two regional indicators.
_FLAG_RU = "\U0001F1F7\U0001F1FA"


def test_truncates_family_emoji_without_orphan_zwj():
    """254 ASCII + family emoji at cluster boundary 255 must not leave a lone ZWJ."""
    s = "X" * 254 + _FAMILY_EMOJI  # 254 cp + 7 cp
    out = truncate_graphemes(s, 256)
    # Result must not end with a lone ZWJ.
    assert not out.endswith("‍"), "orphan ZWJ at end"
    # The whole family cluster must be present (255th cluster).
    assert out.endswith(_FAMILY_EMOJI), f"family cluster truncated, got tail: {out[-10:]!r}"


def test_truncation_inside_family_cluster_drops_whole_cluster():
    """If the limit lands in the middle of a ZWJ chain, drop the entire cluster."""
    # 255 X clusters + family (1 cluster) = 256 clusters total.
    s = "X" * 255 + _FAMILY_EMOJI
    # Limit 256 → keep everything.
    out_keep = truncate_graphemes(s, 256)
    assert out_keep.endswith(_FAMILY_EMOJI)
    # Limit 255 → drop the family entirely; no orphan ZWJ left.
    out_drop = truncate_graphemes(s, 255)
    assert not out_drop.endswith(_FAMILY_EMOJI)
    assert not out_drop.endswith("‍"), "orphan ZWJ"
    assert not out_drop.endswith("👦"), "orphan man/boy glyph"
    assert out_drop == "X" * 255


def test_truncates_thumbs_up_with_skin_tone_keeps_cluster():
    """When the limit lands inside a base+skin-tone cluster, drop the whole cluster."""
    s = "X" * 255 + _THUMBS_TONE  # 255 cp + 2 cp
    out = truncate_graphemes(s, 256)
    # Whole cluster kept (base + tone).
    assert out.endswith(_THUMBS_TONE), f"skin-tone cluster split, got tail: {out[-4:]!r}"
    # And nothing trailing after the cluster.
    assert len(out) == 257


def test_truncates_rainbow_flag_keeps_full_cluster():
    """VS16 + ZWJ sequence must stay together with the base glyph."""
    s = "X" * 255 + _RAINBOW_FLAG
    out = truncate_graphemes(s, 256)
    assert out.endswith(_RAINBOW_FLAG)
    assert not out.endswith("️"), "lone VS16"
    assert not out.endswith("‍"), "lone ZWJ"


def test_keeps_two_simple_emojis():
    """Two non-composite emoji → 2 clusters, 2 clusters kept."""
    s = "ab"
    # Single grapheme 'a', 'b'. Total clusters = 2.
    out = truncate_graphemes(s, 2)
    assert out == "ab"


def test_two_emoji_clusters_kept_when_limit_eq():
    s = "\U0001F600\U0001F600"  # two grinning faces
    out = truncate_graphemes(s, 2)
    assert out == s


def test_skin_tone_pair_truncated_to_one_keeps_full_cluster():
    """When N=1 and the only cluster is base+skin-tone, keep the whole cluster."""
    s = _THUMBS_TONE
    out = truncate_graphemes(s, 1)
    assert out == s
    # Make sure no orphan tone modifier remains.
    assert not out.endswith("\U0001F3FB") or out == s


def test_returns_input_unchanged_when_shorter_than_limit():
    assert truncate_graphemes("abc", 10) == "abc"


def test_empty_string():
    assert truncate_graphemes("", 5) == ""


def test_truncates_flag_regional_indicators_as_one_cluster():
    """Two regional indicators = a flag = a single cluster."""
    s = "X" * 255 + _FLAG_RU
    out = truncate_graphemes(s, 256)
    assert out.endswith(_FLAG_RU)


def test_truncates_combining_marks_with_base():
    """Latin letter + combining acute = 1 cluster; truncation respects the boundary."""
    # 'e' + combining acute (U+0301). Use explicit concat to avoid NFC normalization.
    s = "X" * 255 + "e" + "́"
    # Truncate to 256 clusters: keep all 255 X clusters + the e+acute cluster.
    out_full = truncate_graphemes(s, 256)
    assert out_full.endswith("e" + "́")
    assert len(out_full) == 257

    # Truncate to 255 clusters: drop the e+acute cluster entirely (not just the mark).
    out_drop = truncate_graphemes(s, 255)
    assert not out_drop.endswith("e" + "́"), "combining cluster split: kept base, dropped mark"
    assert not out_drop.endswith("́"), "lone combining mark left behind"
    assert out_drop == "X" * 255
