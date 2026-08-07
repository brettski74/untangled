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


def test_zxcvbn_over_max_length_does_not_raise() -> None:
    """Python zxcvbn caps at 72; product max may be 128/256 — must not raise."""
    for length in (73, 128, 256):
        ratio = crack_time_ratio(
            "a" * length,
            user_inputs=[],
            guess_per_second=10000,
            acceptable_crack_time_days=1000,
        )
        assert isinstance(ratio, float)


def test_zxcvbn_scores_prefix_only_rejects_weak_long_password() -> None:
    """Weak first-72 prefix must still fail even when total length exceeds 72."""
    weak_long = "password" + ("x" * 65)
    assert len(weak_long) == 73
    assert (
        password_strength_ok(
            weak_long,
            username="admin",
            display_name="Local Admin",
            guess_per_second=10000,
            acceptable_crack_time_days=1000,
        )
        is False
    )


def test_zxcvbn_long_strong_prefix_can_pass() -> None:
    """Length > 72 is not an automatic strength hard-fail."""
    # Prefix matches the known-strong sample used elsewhere; pad past 72.
    long_strong = (
        "orchid-lantern-quasar-7N!pQ2xm-wX9mK2pL7vN4qR8sT1uY3zA5bC6dE0fG8hJ1kLm4nP6"
    )
    assert len(long_strong) > 72
    assert (
        password_strength_ok(
            long_strong,
            username="admin",
            display_name="Local Admin",
            guess_per_second=10000,
            acceptable_crack_time_days=1000,
        )
        is True
    )
