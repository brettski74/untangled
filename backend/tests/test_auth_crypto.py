"""Unit tests for Argon2id password hashing and JWT/refresh helpers."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest

from untangled.auth.passwords import hash_password, verify_password
from untangled.auth.tokens import (
    create_access_token,
    decode_access_token,
    hash_refresh_token,
    new_refresh_token,
)


def test_hash_password_is_argon2id_and_verifies() -> None:
    hashed = hash_password("secret-password")
    assert hashed.startswith("$argon2id$")
    assert "secret-password" not in hashed
    assert verify_password(hashed, "secret-password")
    assert not verify_password(hashed, "wrong-password")


def test_access_token_round_trip(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UNTANGLED_JWT_SECRET", "unit-test-secret-at-least-32-bytes!!")
    user_id = uuid4()
    token = create_access_token(user_id)
    assert decode_access_token(token) == user_id


def test_access_token_rejects_tampered(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UNTANGLED_JWT_SECRET", "unit-test-secret-at-least-32-bytes!!")
    token = create_access_token(uuid4())
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(token + "x")


def test_access_token_rejects_malformed_subject(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UNTANGLED_JWT_SECRET", "unit-test-secret-at-least-32-bytes!!")
    from untangled.auth.settings import jwt_secret
    from untangled.auth.tokens import ACCESS_TOKEN_ALGORITHM

    token = jwt.encode(
        {"sub": "not-a-uuid", "typ": "access"},
        jwt_secret(),
        algorithm=ACCESS_TOKEN_ALGORITHM,
    )
    with pytest.raises(jwt.InvalidTokenError, match="invalid subject"):
        decode_access_token(token)


def test_access_token_rejects_expired(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("UNTANGLED_JWT_SECRET", "unit-test-secret-at-least-32-bytes!!")
    monkeypatch.setenv("UNTANGLED_ACCESS_TOKEN_TTL_SECONDS", "1")
    # Bypass settings cache by issuing with an explicit past ``now``.
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    token = create_access_token(uuid4(), now=past)
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_refresh_token_hash_is_stable_and_not_plaintext() -> None:
    token = new_refresh_token()
    digest = hash_refresh_token(token)
    assert digest == hash_refresh_token(token)
    assert digest != token
    assert len(digest) == 64
