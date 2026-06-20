"""OmniRoute (OpenAI-compatible) chat client — used by the date-wheel's AI modes.

Raise AIError when OmniRoute isn't configured or the call fails; callers fall
back to a non-AI pick so the wheel never dead-ends on a config error.
"""

from __future__ import annotations

import json
from typing import Any

import httpx

from pairly.config import get_settings


class AIError(Exception):
    """Raised when the AI pick can't be produced (not configured / call failed)."""


async def chat_json(*, system: str, user: str) -> dict[str, Any]:
    """Call OmniRoute chat completions and parse a JSON object from the reply.

    Expects an OpenAI-compatible `/chat/completions` endpoint. Asks for
    `response_format: json_object`; falls back to extracting the first {...}
    block if the model ignores it.
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
        "response_format": {"type": "json_object"},
    }
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise AIError(f"omnirout call failed: {exc}") from exc

    try:
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise AIError(f"unexpected omnirout response shape: {exc}") from exc

    return _parse_json(content)


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
