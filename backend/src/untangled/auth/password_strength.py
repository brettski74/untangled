"""Password strength classification via zxcvbn (API authoritative, no drift)."""

from __future__ import annotations

from enum import StrEnum
from typing import Any

from zxcvbn import zxcvbn

_SECONDS_PER_DAY = 86400.0
_LITERAL_USER_INPUTS = ("Untangled", "itsm")


class StrengthClass(StrEnum):
    """Unfudged API strength buckets from crack-time ratio."""

    WEAK = "weak"
    MODERATE = "moderate"
    ACCEPTABLE = "acceptable"
    STRONG = "strong"


def build_user_inputs(*, username: str, display_name: str) -> list[str]:
    """zxcvbn ``user_inputs``: username, display-name segments ≥ 3, product literals."""
    inputs: list[str] = []
    user = username.strip()
    if user:
        inputs.append(user)
    for segment in display_name.split():
        if len(segment) >= 3:
            inputs.append(segment)
    inputs.extend(_LITERAL_USER_INPUTS)
    return inputs


def crack_time_ratio(
    password: str,
    *,
    user_inputs: list[str],
    guess_per_second: int,
    acceptable_crack_time_days: int,
) -> float:
    """Estimated crack-time days ÷ configured acceptable days."""
    # zxcvbn raises on empty input; treat as immediately crackable.
    if password == "":
        return 0.0
    result: dict[str, Any] = zxcvbn(password, user_inputs=user_inputs)
    guesses = float(result["guesses"])
    guesses_per_second = max(int(guess_per_second), 1)
    acceptable_days = max(int(acceptable_crack_time_days), 1)
    crack_time_days = guesses / guesses_per_second / _SECONDS_PER_DAY
    return crack_time_days / acceptable_days


def classify_strength(ratio: float) -> StrengthClass:
    """Map crack-time ratio to unfudged API classification buckets."""
    if ratio < 0.5:
        return StrengthClass.WEAK
    if ratio < 1.0:
        return StrengthClass.MODERATE
    if ratio < 5.0:
        return StrengthClass.ACCEPTABLE
    return StrengthClass.STRONG


def password_strength_ok(
    password: str,
    *,
    username: str,
    display_name: str,
    guess_per_second: int,
    acceptable_crack_time_days: int,
) -> bool:
    """True when classification is acceptable or strong (API thresholds)."""
    ratio = crack_time_ratio(
        password,
        user_inputs=build_user_inputs(username=username, display_name=display_name),
        guess_per_second=guess_per_second,
        acceptable_crack_time_days=acceptable_crack_time_days,
    )
    return classify_strength(ratio) in {
        StrengthClass.ACCEPTABLE,
        StrengthClass.STRONG,
    }
