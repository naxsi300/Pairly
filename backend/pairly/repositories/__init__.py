"""Repository package — the security boundary for all DB access."""

from pairly.repositories import (
    admin,
    base,
    bucket,
    countdowns,
    gifts,
    mood,
    pairs,
    qotd,
    users,
    wishlist,
)
from pairly.repositories.base import (
    NotPairedError,
    PairAccessError,
    get_user_pair,
    pair_members,
    resolve_user_by_tg,
)

__all__ = [
    "NotPairedError",
    "PairAccessError",
    "admin",
    "base",
    "bucket",
    "countdowns",
    "get_user_pair",
    "gifts",
    "mood",
    "pair_members",
    "pairs",
    "qotd",
    "resolve_user_by_tg",
    "users",
    "wishlist",
]
