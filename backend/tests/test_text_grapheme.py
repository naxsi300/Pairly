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
    """249 ASCII + family emoji (256 cps total, 250 clusters) at limit 256 must keep family."""
    s = "X" * 249 + _FAMILY_EMOJI  # 249 cp + 7 cp = 256 cp
    out = truncate_graphemes(s, 256)
    # Result must not end with a lone ZWJ.
    assert not out.endswith("‍"), "orphan ZWJ at end"
    # The whole family cluster must be present.
    assert out.endswith(_FAMILY_EMOJI), f"family cluster truncated, got tail: {out[-10:]!r}"


def test_truncation_inside_family_cluster_drops_whole_cluster():
    """If the limit lands in the middle of a ZWJ chain, drop the entire cluster."""
    # 249 X + family (1 cluster) = 250 clusters, 256 cps — both caps fit at 256.
    s = "X" * 249 + _FAMILY_EMOJI
    # Limit 256 → keep everything (250 clusters, 256 cps).
    out_keep = truncate_graphemes(s, 256)
    assert out_keep.endswith(_FAMILY_EMOJI)
    assert len(out_keep) == 256
    # Limit 249 → drop the family entirely; no orphan ZWJ left.
    out_drop = truncate_graphemes(s, 249)
    assert not out_drop.endswith(_FAMILY_EMOJI)
    assert not out_drop.endswith("‍"), "orphan ZWJ"
    assert not out_drop.endswith("👦"), "orphan man/boy glyph"
    assert out_drop == "X" * 249


def test_truncates_thumbs_up_with_skin_tone_keeps_cluster():
    """When the limit lands inside a base+skin-tone cluster, drop the whole cluster."""
    s = "X" * 254 + _THUMBS_TONE  # 254 cp + 2 cp = 256 cp
    out = truncate_graphemes(s, 256)
    # Whole cluster kept (base + tone).
    assert out.endswith(_THUMBS_TONE), f"skin-tone cluster split, got tail: {out[-4:]!r}"
    # And nothing trailing after the cluster.
    assert len(out) == 256


def test_truncates_rainbow_flag_keeps_full_cluster():
    """VS16 + ZWJ sequence must stay together with the base glyph."""
    # Rainbow flag = 4 cps. 252 X + flag = 256 cps.
    s = "X" * 252 + _RAINBOW_FLAG
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
    # Pass explicit code_point_cap=2 so the 2-cp cluster fits.
    s = _THUMBS_TONE
    out = truncate_graphemes(s, 1, code_point_cap=2)
    assert out == s
    # Make sure no orphan tone modifier remains.
    assert not out.endswith("\U0001F3FB") or out == s

    # Default code_point_cap (= n = 1) cannot fit the 2-cp cluster → empty.
    out_empty = truncate_graphemes(s, 1)
    assert out_empty == ""


def test_returns_input_unchanged_when_shorter_than_limit():
    assert truncate_graphemes("abc", 10) == "abc"


def test_empty_string():
    assert truncate_graphemes("", 5) == ""


def test_truncates_flag_regional_indicators_as_one_cluster():
    """Two regional indicators = a flag = a single cluster."""
    s = "X" * 254 + _FLAG_RU  # 254 cp + 2 cp = 256 cp, 255 clusters
    out = truncate_graphemes(s, 256)
    assert out.endswith(_FLAG_RU)


def test_truncates_combining_marks_with_base():
    """Latin letter + combining acute = 1 cluster; truncation respects the boundary."""
    # 'e' + combining acute (U+0301). Use explicit concat to avoid NFC normalization.
    s = "X" * 254 + "e" + "́"  # 254 cp + 2 cp = 256 cp, 255 clusters
    # Truncate to 256 clusters: keep all 254 X clusters + the e+acute cluster.
    out_full = truncate_graphemes(s, 256)
    assert out_full.endswith("e" + "́")
    assert len(out_full) == 256

    # Truncate to 254 clusters: drop the e+acute cluster entirely (not just the mark).
    out_drop = truncate_graphemes(s, 254)
    assert not out_drop.endswith("e" + "́"), "combining cluster split: kept base, dropped mark"
    assert not out_drop.endswith("́"), "lone combining mark left behind"
    assert out_drop == "X" * 254


def test_family_emoji_capped_by_code_points_at_default():
    """A 60-grapheme family-emoji string must NOT exceed 60 code points by default.

    DB columns like MoodEntry.note (String(60)) count CODE POINTS in Postgres.
    The default code_point_cap == n backstop protects against silent truncation
    or StringDataRightTruncation.
    """
    s = _FAMILY_EMOJI * 60  # 60 clusters, 7*60 = 420 code points
    out = truncate_graphemes(s, 60)
    assert len(out) <= 60, f"code-point backstop failed: len={len(out)}"
    # The result must be a whole number of family clusters (8 fit in 60 cps).
    assert len(out) % 7 == 0, f"result not aligned to cluster boundary: {len(out)} cps"
    # No orphan ZWJ at end (would indicate a mid-cluster cut).
    assert not out.endswith("‍"), "orphan ZWJ at end"
    # If anything is present, it must end with a complete family cluster (the boy).
    if out:
        assert out.endswith("\U0001F466"), "result should end with complete family cluster"
        assert out == _FAMILY_EMOJI * 8, "expected exactly 8 family clusters (56 cps)"


def test_family_emoji_capped_by_explicit_code_point_cap():
    """Explicit code_point_cap must be enforced independently of cluster cap."""
    s = _FAMILY_EMOJI * 100  # 100 clusters, 700 code points
    out = truncate_graphemes(s, 100, code_point_cap=256)
    assert len(out) <= 256, f"code-point cap not enforced: len={len(out)}"
    assert len(out) % 7 == 0, f"result not aligned to cluster boundary: {len(out)} cps"
    # No orphan ZWJ at end.
    assert not out.endswith("‍"), "orphan ZWJ at end"
    # 256 / 7 = 36 full clusters = 252 cps; 37th would push to 259 > 256.
    assert out == _FAMILY_EMOJI * 36, f"expected 36 family clusters (252 cps), got {len(out)}"
    assert not out.endswith("\U0001F466") or out.endswith(_FAMILY_EMOJI)


def test_plain_ascii_unchanged_by_code_point_backstop():
    """ASCII strings: grapheme count == code-point count, no change in behavior."""
    s = "hello world"
    assert truncate_graphemes(s, 5) == "hello"
    assert truncate_graphemes(s, 5, code_point_cap=5) == "hello"
    assert truncate_graphemes(s, 100) == s
    assert truncate_graphemes(s, 100, code_point_cap=100) == s


def test_no_orphan_cases_still_pass_with_code_point_backstop():
    """Existing no-orphan guarantees must hold with the new code-point backstop."""
    # 250 X + family emoji (250 + 7 = 257 cps, 251 clusters).
    # Limit 256 clusters, default cap 256 cps → family cannot fit (would be 257).
    s = "X" * 250 + _FAMILY_EMOJI
    out = truncate_graphemes(s, 256)
    # Code-point cap drops the family; we must end with the 250 X's.
    assert out == "X" * 250
    assert not out.endswith("‍"), "orphan ZWJ"
    assert not out.endswith("\U0001F466"), "orphan boy glyph"

    # 250 X + family, limit 251 → family dropped (cluster cap also).
    out2 = truncate_graphemes(s, 251)
    assert out2 == "X" * 250

    # 245 X + family (245 + 7 = 252 cps, 246 clusters).
    s2 = "X" * 245 + _FAMILY_EMOJI
    out3 = truncate_graphemes(s2, 256)
    # Both caps (256 cluster / 256 cps) fit — family kept.
    assert out3.endswith(_FAMILY_EMOJI)
    assert not out3.endswith("‍")


def test_code_point_cap_zero_returns_empty():
    """code_point_cap=0 means nothing fits — return empty string."""
    s = "abc"
    assert truncate_graphemes(s, 10, code_point_cap=0) == ""


def test_single_cluster_exceeding_cap_returns_empty():
    """If a single cluster alone exceeds the code-point cap, return empty."""
    # Family emoji = 7 code points. Cap = 3. Nothing fits.
    out = truncate_graphemes(_FAMILY_EMOJI, 1, code_point_cap=3)
    assert out == ""


def test_single_cluster_fits_cap_kept():
    """If a single cluster fits within the code-point cap, keep it."""
    # Family emoji = 7 code points. Cap = 7.
    out = truncate_graphemes(_FAMILY_EMOJI, 1, code_point_cap=7)
    assert out == _FAMILY_EMOJI


def test_ascii_mixed_with_emoji_code_point_cap():
    """ASCII + emoji mix: code-point cap drops trailing clusters to fit."""
    # 250 ASCII (250 cps) + family emoji (7 cps) = 257 cps total
    s = "X" * 250 + _FAMILY_EMOJI
    # Cap 256 code points: drop the family (which would push us to 257).
    out = truncate_graphemes(s, 300, code_point_cap=256)
    assert len(out) <= 256
    assert out == "X" * 250, f"expected only X's, got tail {out[-5:]!r}"
    assert not out.endswith("‍")
