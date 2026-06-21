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
A cluster is never split. It also enforces an optional code-point backstop so
the result is safe to store in a Postgres ``VARCHAR(n)`` / SQLAlchemy
``String(n)`` column, which counts code points.
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
    return bool(_is_regional_indicator(cp) and prev_was_ri)


def _cluster_boundaries(s: str) -> list[int]:
    """Return cluster start indices in ``s``, terminated by ``len(s)``.

    Cluster k occupies ``s[boundaries[k]:boundaries[k+1]]``. The list always
    starts with 0 and ends with ``len(s)``.
    """
    if not s:
        return [0, 0]
    boundaries = [0]
    total_cp = len(s)
    prev_ch: str | None = None
    prev_was_ri = False
    after_zwj = False
    for i in range(total_cp):
        ch = s[i]
        if i == 0:
            # First code point always starts the first cluster.
            pass
        elif not _is_joiner(ch, prev_ch, prev_was_ri, after_zwj):
            boundaries.append(i)
        after_zwj = ch == _ZWJ
        prev_ch = ch
        prev_was_ri = _is_regional_indicator(ord(ch))
    boundaries.append(total_cp)
    return boundaries


def truncate_graphemes(s: str, n: int, code_point_cap: int | None = None) -> str:
    """Return ``s`` truncated to at most ``n`` grapheme clusters AND ``code_point_cap`` code points.

    Never splits a cluster. If ``s`` already satisfies both caps, returns it
    unchanged. Pure function; no external dependencies.

    ``code_point_cap`` defaults to ``n`` (so the result also fits in a DB column
    of width ``n``, e.g. Postgres ``VARCHAR(n)`` / SQLAlchemy ``String(n)``,
    which count code points — not grapheme clusters). A family-emoji is one
    grapheme cluster but ~7 code points, so without this backstop a 60-grapheme
    limit could silently overflow a 60-char column.

    If even a single cluster exceeds ``code_point_cap``, returns ``""`` —
    matching the no-orphan-cluster guarantee on the grapheme side.
    """
    if n <= 0 or not s:
        return ""
    if code_point_cap is None:
        code_point_cap = n
    if code_point_cap <= 0:
        return ""

    boundaries = _cluster_boundaries(s)
    # ``boundaries`` is a list of cluster start indices, terminated by
    # ``len(s)``. Cluster k occupies ``s[boundaries[k]:boundaries[k+1]]``.
    cluster_count = len(boundaries) - 1
    # Iterate cluster-by-cluster. Pick as many leading clusters as fit
    # within both caps.
    kept = 0
    cumulative_cp = 0
    for k in range(cluster_count):
        cp_len = boundaries[k + 1] - boundaries[k]
        if cp_len > code_point_cap:
            # A single cluster alone overflows the code-point cap.
            if k == 0:
                return ""
            break
        if k >= n:
            break
        if cumulative_cp + cp_len > code_point_cap:
            break
        kept += 1
        cumulative_cp += cp_len

    if kept == 0:
        return ""
    end = boundaries[kept]
    return s[:end]


__all__ = ["truncate_graphemes"]
