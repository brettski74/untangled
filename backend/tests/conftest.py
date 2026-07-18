"""Shared pytest fixtures for mapping-layer tests."""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


@pytest.fixture
def repo_definitions(repo_root: Path) -> Path:
    return repo_root / "backend" / "class-definitions"
