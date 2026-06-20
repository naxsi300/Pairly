"""Grapheme-cluster-aware text helpers.

Python's ``str[:N]`` slices by code point, which can split a grapheme cluster
mid-cluster (e.g. an emoji family with a ZWJ, a thumbs-up with a skin-tone
modifier, a flag made of two regional indicators). Telegram renders the
resulting orphan modifier glyphs as tofu boxes or miss them entirely.

We hand-roll a small grapheme-cluster boundary scanner with no third-party
dependencies. It treats as part of the current cluster:

  * ZWJ (U+200D) — joins the previous codepoint to the next one into one cluster.
  * Variation selectors (U+FE00..U+FE0F) — text/emoji presentation of the base.
  * Combining diacritical marks (U+0300..U+036F) — base + combining = one cluster.
  * Skin-tone modifiers (U+1F3FB..U+1F3FF) — base + tone = one cluster.
  * Regional indicators (U+1F1E6..U+1F1FF) — consecutive pairs = a flag = one
    cluster (a single unpaired indicator is its own cluster).

The function counts clusters, not code points, and stops at the N-th boundary.
A cluster is never split.
"""

from __future__ import annotations

_ZWJ = "‍"
_VS_LOW = 0xFE00
_VS_HIGH = 0xFE0F
_COMBINING_LOW = 0x0300
_COMBINING_HIGH = 0x036F
_SKIN_TONE_LOW = 0x1F3FB
_SKIN_TONE_HIGH = 0x1F3FF
_RI_LOW = 0x1F1E6
_RI_HIGH = 0x1F1FF


def _is_variation_selector(cp: int) -> bool:
    return _VS_LOW <= cp <= _VS_HIGH


def _is_combining_mark(cp: int) -> bool:
    return _COMBINING_LOW <= cp <= _COMBINING_HIGH


def _is_skin_tone(cp: int) -> bool:
    return _SKIN_TONE_LOW <= cp <= _SKIN_TONE_HIGH


def _is_regional_indicator(cp: int) -> bool:
    return _RI_LOW <= cp <= _RI_HIGH


def _is_joiner(ch: str, prev_ch: str | None, prev_was_ri: bool, after_zwj: bool) -> bool:
    """True if ``ch`` should be considered part of the cluster started by ``prev_ch``.

    A "joiner" continues the current cluster instead of starting a new one.
    ZWJ always continues. Variation selectors / combining marks / skin-tones
    continue. A regional indicator continues only if the previous code point
    was also a regional indicator (pair = a flag). After a ZWJ, the next code
    point is ALWAYS part of the current cluster (ZWJ glues two emoji into one
    grapheme, e.g. rainbow flag = white flag VS16 + ZWJ + rainbow).
    """
    if after_zwj:
        return True
    if ch == _ZWJ:
        return True
    cp = ord(ch)
    if _is_variation_selector(cp) or _is_combining_mark(cp) or _is_skin_tone(cp):
        return True
    if _is_regional_indicator(cp) and prev_was_ri:
        return True
    return False


def truncate_graphemes(s: str, n: int) -> str:
    """Return ``s`` truncated to at most ``n`` grapheme clusters.

    Never splits a cluster. If ``s`` has ``n`` or fewer clusters, returns
    ``s`` unchanged. Pure function; no external dependencies.
    """
    if n <= 0 or not s:
        return ""

    clusters = 0
    i = 0
    total_cp = len(s)
    prev_ch: str | None = None
    prev_was_ri = False
    after_zwj = False
    while i < total_cp:
        ch = s[i]
        if i == 0 or not _is_joiner(ch, prev_ch, prev_was_ri, after_zwj):
            clusters += 1
            if clusters > n:
                # Last started cluster exceeds the limit: back off to its start.
                return s[:i]
            if clusters == n:
                # Keep consuming the rest of this cluster (joiners) but stop
                # at the first code point that would start a new cluster.
                j = i + 1
                prev_ch_inner = ch
                prev_was_ri_inner = _is_regional_indicator(ord(ch))
                after_zwj_inner = False
                while j < total_cp:
                    nxt = s[j]
                    if not _is_joiner(nxt, prev_ch_inner, prev_was_ri_inner, after_zwj_inner):
                        break
                    after_zwj_inner = nxt == _ZWJ
                    prev_ch_inner = nxt
                    prev_was_ri_inner = _is_regional_indicator(ord(nxt))
                    j += 1
                return s[:j]
        after_zwj = ch == _ZWJ
        prev_ch = ch
        prev_was_ri = _is_regional_indicator(ord(ch))
        i += 1

    # All clusters fit.
    return s


__all__ = ["truncate_graphemes"]
