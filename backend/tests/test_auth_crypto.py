"""Unit tests for Argon2id password hashing and JWT verify."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import (
    Encoding,
    NoEncryption,
    PrivateFormat,
    load_pem_private_key,
)
from jwt_mint import mint_access_token

from untangled.auth.csrf import origin_is_exact_match
from untangled.auth.passwords import hash_password, verify_password
from untangled.auth.settings import (
    jwt_public_key,
    public_origin,
    reset_jwt_public_key_for_tests,
    reset_public_origin_for_tests,
)
from untangled.auth.tokens import (
    decode_access_token,
    verify_access_jwt,
)


def test_hash_password_is_argon2id_and_verifies() -> None:
    hashed = hash_password("secret-password")
    assert hashed.startswith("$argon2id$")
    assert "secret-password" not in hashed
    assert verify_password(hashed, "secret-password")
    assert not verify_password(hashed, "wrong-password")


def test_access_token_round_trip() -> None:
    user_id = uuid4()
    token = mint_access_token(user_id)
    assert decode_access_token(token) == user_id


def test_access_token_rejects_tampered() -> None:
    token = mint_access_token(uuid4())
    with pytest.raises(jwt.PyJWTError):
        decode_access_token(token + "x")


def test_access_token_rejects_malformed_subject() -> None:
    token = mint_access_token(uuid4(), extra={"sub": "not-a-uuid"})
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token)


def test_access_token_rejects_expired() -> None:
    past = datetime.now(timezone.utc) - timedelta(hours=1)
    token = mint_access_token(uuid4(), now=past, ttl_seconds=1)
    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(token)


def test_access_token_rejects_missing_exp() -> None:
    import os

    key = load_pem_private_key(
        os.environ["UNTANGLED_JWT_PRIVATE_KEY"].encode(),
        password=None,
    )
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "typ": "access",
        },
        key,
        algorithm="ES256",
    )
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(token)


def test_access_token_rejects_other_p256_key() -> None:
    other = ec.generate_private_key(ec.SECP256R1())
    pem = other.private_bytes(Encoding.PEM, PrivateFormat.PKCS8, NoEncryption()).decode()
    token = mint_access_token(uuid4(), private_pem=pem)
    with pytest.raises(jwt.InvalidSignatureError):
        decode_access_token(token)


def test_access_token_rejects_hs256() -> None:
    token = jwt.encode(
        {
            "sub": str(uuid4()),
            "iat": int(datetime.now(timezone.utc).timestamp()),
            "exp": int((datetime.now(timezone.utc) + timedelta(minutes=15)).timestamp()),
            "typ": "access",
        },
        "unit-test-secret-at-least-32-bytes!!",
        algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidAlgorithmError):
        decode_access_token(token)


def test_verify_access_jwt_expired_valid_vs_invalid() -> None:
    user_id = uuid4()
    live = mint_access_token(user_id)
    assert verify_access_jwt(live).kind == "valid"

    past = datetime.now(timezone.utc) - timedelta(hours=1)
    expired = mint_access_token(user_id, now=past, ttl_seconds=1)
    assert verify_access_jwt(expired).kind == "expired"

    tampered = live + "x"
    assert verify_access_jwt(tampered).kind == "invalid"

    no_sid = mint_access_token(user_id, extra={"sid": ""})
    assert verify_access_jwt(no_sid).kind == "invalid"

    wrong_typ = mint_access_token(user_id, extra={"typ": "refresh"})
    assert verify_access_jwt(wrong_typ).kind == "invalid"


def test_jwt_public_key_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("UNTANGLED_JWT_PUBLIC_KEY", raising=False)
    monkeypatch.delenv("UNTANGLED_JWT_PUBLIC_KEY_PATH", raising=False)
    reset_jwt_public_key_for_tests()
    with pytest.raises(RuntimeError, match="UNTANGLED_JWT_PUBLIC_KEY"):
        jwt_public_key()
    monkeypatch.undo()
    reset_jwt_public_key_for_tests()


def test_origin_is_exact_match() -> None:
    origin = "https://localhost:8443"
    assert origin_is_exact_match("https://localhost:8443", origin) is True
    assert origin_is_exact_match("https://127.0.0.1:8443", origin) is False
    assert origin_is_exact_match("https://localhost:443", origin) is False
    assert origin_is_exact_match(None, origin) is False
    assert origin_is_exact_match("", origin) is False


def test_public_origin_fail_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("UNTANGLED_PUBLIC_ORIGIN", raising=False)
    reset_public_origin_for_tests()
    with pytest.raises(RuntimeError, match="UNTANGLED_PUBLIC_ORIGIN"):
        public_origin()
    monkeypatch.setenv("UNTANGLED_PUBLIC_ORIGIN", "https://localhost:8443/extra")
    reset_public_origin_for_tests()
    with pytest.raises(RuntimeError, match="exact origin"):
        public_origin()
    monkeypatch.setenv("UNTANGLED_PUBLIC_ORIGIN", "https://localhost:8443")
    reset_public_origin_for_tests()
    assert public_origin() == "https://localhost:8443"
    reset_public_origin_for_tests()
