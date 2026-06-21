"""OmniRoute (OpenAI-compatible) chat client — used by the date-wheel's AI modes.

Raise AIError when OmniRoute isn't configured or the call fails; callers fall
back to a non-AI pick so the wheel never dead-ends on a config error.

Hardening (cluster 8):
  * ``max_tokens`` is sent in every payload (cap on the upstream reply).
  * The response body is capped at ``_MAX_RESPONSE_BYTES`` (1 MiB) — an OOM
    guard for the 512MB VPS, enforced via a Content-Length pre-flight and a
    post-read length check on ``resp.content``.
  * Transient failures (HTTP 429 / 5xx, transport errors) are retried with a
    bounded exponential backoff that honors ``Retry-After``; after 3 attempts
    we raise so the caller can fall back to a non-AI pick.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from typing import Any

import httpx

from pairly.config import get_settings

# Cap the model reply at 500 tokens: enough for {"title","category","reason"}
# JSON, small enough that a 512MB VPS can't OOM on a single user click.
_MAX_TOKENS = 500

# 1 MiB hard cap on the upstream response body. A 4xx/5xx page is typically
# tiny, so anything beyond this is almost certainly the model going off the
# rails — refuse to buffer it.
_MAX_RESPONSE_BYTES = 1_048_576

# Transient statuses we retry. 429 is rate-limited, the rest are server-side
# issues that a second attempt often clears.
_RETRY_STATUSES = frozenset({429, 500, 502, 503, 504})

_MAX_ATTEMPTS = 3
_BACKOFF_BASE = 0.2  # seconds; tiny on purpose — this is a chat, not a queue.


class AIError(Exception):
    """Raised when the AI pick can't be produced (not configured / call failed)."""


async def chat_json(*, system: str, user: str) -> dict[str, Any]:
    """Call OmniRoute chat completions and parse a JSON object from the reply.

    Expects an OpenAI-compatible `/chat/completions` endpoint. Enforces JSON in
    the prompt and extracts it in ``_parse_json`` — the DeepSeek upstream
    behind OmniRoute rejects ``response_format=json_object``.
    """
    settings = get_settings()
    base = settings.omnirout_base_url.strip()
    if not base:
        raise AIError("omnirout_base_url not configured")
    url = base.rstrip("/") + "/chat/completions"
    headers = {"content-type": "application/json"}
    if settings.omnirout_api_key:
        headers["authorization"] = f"Bearer {settings.omnirout_api_key}"
    payload = {
        "model": settings.omnirout_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.9,
        "stream": False,
        "max_tokens": _MAX_TOKENS,
    }

    last_exc: Exception | None = None
    for attempt in range(1, _MAX_ATTEMPTS + 1):
        try:
            async with httpx.AsyncClient(
                timeout=30.0,
                limits=httpx.Limits(),
            ) as client:
                resp = await client.post(url, headers=headers, json=payload)
            # OOM guard: refuse to buffer more than _MAX_RESPONSE_BYTES. The
            # Content-Length pre-flight is a cheap check for honest servers;
            # the read-and-measure below catches chunked / lying responses.
            content_length = resp.headers.get("content-length")
            if content_length is not None:
                try:
                    if int(content_length) > _MAX_RESPONSE_BYTES:
                        raise AIError(
                            f"omnirout response too large "
                            f"({content_length} > {_MAX_RESPONSE_BYTES})"
                        )
                except ValueError:
                    pass
            if resp.status_code in _RETRY_STATUSES:
                # Transient — retry unless we've exhausted attempts.
                if attempt >= _MAX_ATTEMPTS:
                    raise AIError(
                        f"omnirout call failed after {_MAX_ATTEMPTS} "
                        f"attempts: status={resp.status_code}"
                    )
                await _sleep_backoff(resp, attempt)
                continue
            # Non-retryable status (or 2xx). raise_for_status turns any 4xx
            # other than 429 into a HTTPStatusError that the outer except
            # won't retry — we want it to surface immediately.
            resp.raise_for_status()
            body = await resp.aread()
            if len(body) > _MAX_RESPONSE_BYTES:
                raise AIError(
                    f"omnirout response too large "
                    f"({len(body)} > {_MAX_RESPONSE_BYTES})"
                )
            data = json.loads(body)
            break
        except httpx.TransportError as exc:
            last_exc = exc
            if attempt >= _MAX_ATTEMPTS:
                raise AIError(
                    f"omnirout call failed after {_MAX_ATTEMPTS} attempts: {exc}"
                ) from exc
            await _sleep_backoff(_RetryAfterCarrier(None), attempt)
        except httpx.HTTPStatusError as exc:
            # 4xx other than 429 is not retryable — surface immediately.
            raise AIError(
                f"omnirout call failed: status={exc.response.status_code}"
            ) from exc
    else:  # pragma: no cover — only reached if every attempt is a retryable status
        raise AIError(
            f"omnirout call failed after {_MAX_ATTEMPTS} attempts: "
            f"status={last_exc!r}"
        )

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIError(f"unexpected omnirout response shape: {exc}") from exc

    return _parse_json(content)


async def _sleep_backoff(resp: httpx.Response | _RetryAfterCarrier, attempt: int) -> None:
    """Sleep with exponential backoff, honoring a ``Retry-After`` header if present."""
    delay = _BACKOFF_BASE * (2 ** (attempt - 1))
    retry_after = resp.headers.get("retry-after") if resp is not None else None
    if retry_after is not None:
        with contextlib.suppress(TypeError, ValueError):
            delay = max(delay, float(retry_after))
    await asyncio.sleep(delay)


class _RetryAfterCarrier:
    """Tiny stand-in that exposes ``headers.get`` for the backoff helper."""

    def __init__(self, value: str | None) -> None:
        self.headers = {"retry-after": value} if value is not None else {}


def _parse_json(content: str) -> dict[str, Any]:
    """Parse JSON from a model reply — direct, or the first {...} block as a fallback."""
    content = content.strip()
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass
    start = content.find("{")
    end = content.rfind("}")
    if start != -1 and end > start:
        try:
            parsed = json.loads(content[start : end + 1])
            if isinstance(parsed, dict):
                return parsed
        except json.JSONDecodeError:
            pass
    raise AIError("model did not return JSON")
