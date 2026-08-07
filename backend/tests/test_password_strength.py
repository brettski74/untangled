"""Unit tests for zxcvbn password strength helpers."""

from __future__ import annotations

from untangled.auth.password_strength import (
    StrengthClass,
    build_user_inputs,
    classify_strength,
    crack_time_ratio,
    password_strength_ok,
)


def test_build_user_inputs_segments_and_literals() -> None:
    inputs = build_user_inputs(
        username="jsmith",
        display_name="Jo Ann Q Smith",
    )
    assert inputs[0] == "jsmith"
    assert "Ann" in inputs
    assert "Smith" in inputs
    assert "Jo" not in inputs  # length < 3
    assert "Q" not in inputs
    assert "Untangled" in inputs
    assert "itsm" in inputs


def test_classify_strength_unfudged_buckets() -> None:
    assert classify_strength(0.49) == StrengthClass.WEAK
    assert classify_strength(0.5) == StrengthClass.MODERATE
    assert classify_strength(0.99) == StrengthClass.MODERATE
    assert classify_strength(1.0) == StrengthClass.ACCEPTABLE
    assert classify_strength(4.99) == StrengthClass.ACCEPTABLE
    assert classify_strength(5.0) == StrengthClass.STRONG


def test_password_strength_ok_rejects_weak_and_accepts_strong() -> None:
    weak = password_strength_ok(
        "password",
        username="admin",
        display_name="Local Admin",
        guess_per_second=10000,
        acceptable_crack_time_days=1000,
    )
    assert weak is False

    strong = password_strength_ok(
        "orchid-lantern-quasar-7N!pQ2xm",
        username="admin",
        display_name="Local Admin",
        guess_per_second=10000,
        acceptable_crack_time_days=1000,
    )
    assert strong is True


def test_user_inputs_penalise_username_in_password() -> None:
    """Password built from username should score worse with user_inputs applied."""
    without = crack_time_ratio(
        "jsmithjsmithjsmith!",
        user_inputs=[],
        guess_per_second=10000,
        acceptable_crack_time_days=1000,
    )
    with_inputs = crack_time_ratio(
        "jsmithjsmithjsmith!",
        user_inputs=build_user_inputs(username="jsmith", display_name="X"),
        guess_per_second=10000,
        acceptable_crack_time_days=1000,
    )
    assert with_inputs <= without
