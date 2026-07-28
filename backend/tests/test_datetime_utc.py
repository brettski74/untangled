"""Unit tests for whole-second UTC datetime policy."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from untangled.mapping.datetime_utc import (
    format_utc_iso_z,
    require_utc_seconds,
    utc_now,
)


def test_require_utc_seconds_rejects_naive() -> None:
    with pytest.raises(ValueError, match="timezone-aware"):
        require_utc_seconds(datetime(2026, 7, 18, 12, 0, 0, 123456))


def test_require_utc_seconds_rounds_half_up() -> None:
    base = datetime(2026, 7, 18, 12, 0, 0, tzinfo=timezone.utc)
    assert require_utc_seconds(base.replace(microsecond=499_999)) == base
    assert require_utc_seconds(base.replace(microsecond=500_000)) == base + timedelta(
        seconds=1
    )


def test_require_utc_seconds_normalizes_offset() -> None:
    offset = datetime(2026, 7, 18, 8, 0, 0, 600_000, tzinfo=timezone(timedelta(hours=-4)))
    assert require_utc_seconds(offset) == datetime(
        2026, 7, 18, 12, 0, 1, tzinfo=timezone.utc
    )


def test_format_utc_iso_z_omits_fractional_seconds() -> None:
    value = datetime(2026, 7, 14, 5, 2, 34, 123456, tzinfo=timezone.utc)
    assert format_utc_iso_z(value) == "2026-07-14T05:02:34Z"
    high = datetime(2026, 7, 14, 5, 2, 34, 600_000, tzinfo=timezone.utc)
    assert format_utc_iso_z(high) == "2026-07-14T05:02:35Z"


def test_utc_now_is_second_precision() -> None:
    now = utc_now()
    assert now.tzinfo is not None
    assert now.utcoffset() == timedelta(0)
    assert now.microsecond == 0
