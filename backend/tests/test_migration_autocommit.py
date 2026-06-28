"""Regression guard for the migration ALTER-TYPE-in-transaction bug.

History
-------
Migration ``0007_wishlist_pending`` extends the Postgres ``wishliststatus``
enum with a new ``PENDING`` value via ``ALTER TYPE wishliststatus ADD VALUE
'PENDING'``. On Postgres this statement **cannot run inside a transaction
block** (SQLSTATE 25001) — ``alembic upgrade head`` fails and
``alembic_version`` sticks at ``0006``.

The fix is to wrap the statement in
``op.get_context().autocommit_block()``, which commits the surrounding tx
and drops to AUTOCOMMIT isolation for the ALTER.

What this test pins
-------------------
* The module source must import ``op`` from alembic (so it can call
  ``op.get_context().autocommit_block``).
* The ``upgrade()`` body must reference ``autocommit_block`` so the ALTER
  TYPE runs outside the migration transaction.
* The Postgres branch must call ``ALTER TYPE wishliststatus ADD VALUE
  IF NOT EXISTS 'PENDING'`` — the IF NOT EXISTS makes the migration
  re-runnable after a partial failure.

If someone later refactors 0007 and drops the autocommit wrapper, this test
fails before the change reaches the migrate-check CI job that spins up a
real Postgres container.

SQLite no-op
------------
On SQLite the wishlist status column is a plain VARCHAR, so the upgrade
branches on ``dialect.name == "postgresql"`` and skips the ALTER entirely.
That path is not exercised here (SQLite has no enum to alter and would
error on a literal ``ALTER TYPE`` statement); the existing per-test
``alembic upgrade head`` in conftest already covers the SQLite leg.
"""

from __future__ import annotations

import importlib.util
import inspect
from pathlib import Path

import pytest

_MIGRATION_PATH = (
    Path(__file__).resolve().parents[2]
    / "backend"
    / "pairly"
    / "migrations"
    / "versions"
    / "0007_wishlist_pending.py"
)


@pytest.fixture
def migration_module():
    """Import 0007 as a module so we can introspect its upgrade() source."""
    spec = importlib.util.spec_from_file_location(
        "mig_0007_wishlist_pending", _MIGRATION_PATH
    )
    module = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


def _code_only(src: str) -> str:
    """Strip ``# ...`` line comments from a source string.

    The migration has explanatory comments that legitimately mention
    ``autocommit_block``; we only care about the *executable* code.
    """
    cleaned_lines = []
    for line in src.splitlines():
        # Drop everything after the first ``#`` that isn't inside a string.
        # Alembic migration code is simple enough that a naive split is safe;
        # we don't use ``#`` inside string literals in this file.
        idx = line.find("#")
        if idx == -1:
            cleaned_lines.append(line)
        else:
            cleaned_lines.append(line[:idx])
    return "\n".join(cleaned_lines)


def test_upgrade_uses_autocommit_block(migration_module) -> None:
    """The Postgres ALTER TYPE must be wrapped in autocommit_block()."""
    upgrade_src = _code_only(inspect.getsource(migration_module.upgrade))
    assert "autocommit_block" in upgrade_src, (
        "0007 upgrade() must wrap the ALTER TYPE in "
        "op.get_context().autocommit_block() — Postgres rejects "
        "ALTER TYPE ... ADD VALUE inside a transaction block "
        "(SQLSTATE 25001). Check that the executable line uses "
        "`with op.get_context().autocommit_block():`."
    )


def test_upgrade_targets_wishlist_status_enum(migration_module) -> None:
    """The ALTER TYPE must target the wishliststatus enum, idempotently."""
    upgrade_src = inspect.getsource(migration_module.upgrade)
    assert "ALTER TYPE wishliststatus" in upgrade_src
    assert "ADD VALUE IF NOT EXISTS 'PENDING'" in upgrade_src, (
        "0007 must use 'ADD VALUE IF NOT EXISTS' so the migration is "
        "idempotent on re-run after a partial failure."
    )


def test_upgrade_is_postgres_only(migration_module) -> None:
    """SQLite has no enum/ALTER TYPE — must dialect-gate to postgres."""
    upgrade_src = inspect.getsource(migration_module.upgrade)
    assert 'dialect.name == "postgresql"' in upgrade_src, (
        "0007 must guard the ALTER TYPE on bind.dialect.name == "
        "'postgresql' so the SQLite path (plain VARCHAR column) is a "
        "no-op. SQLite has no ALTER TYPE syntax and would error."
    )


def test_downgrade_remains_noop(migration_module) -> None:
    """Postgres cannot remove enum values; downgrade must stay a no-op."""
    body = inspect.getsource(migration_module.downgrade)
    # downgrade() should be a trivial `pass` — no ALTER / DROP / DDL.
    assert "pass" in body
    assert "ALTER" not in body
    assert "DROP" not in body
