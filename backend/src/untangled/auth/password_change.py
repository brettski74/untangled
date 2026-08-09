"""Authenticated self-service password change pipeline."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from psycopg import Connection
from pydantic import BaseModel

from untangled.auth.password_strength import password_strength_ok
from untangled.auth.passwords import hash_password, verify_password
from untangled.auth.store import update_user_password_hash
from untangled.mapping.registry import class_definition

# Substitute for unbound current-password verify work (never persisted).
_DUMMY_CURRENT_PASSWORD = "\0untangled-change-password-dummy"

_SUCCESS = "Password change complete."
_FAILURE = "Password change failed."


def _schema_password_maximum_chars_bound() -> int:
    """Attribute max-value of ``password-maximum-chars`` (not live config)."""
    defn = class_definition("system_config")
    for attr in defn.attributes:
        if attr.name_snake == "password_maximum_chars":
            if attr.max_value is None:
                break
            return int(attr.max_value)
    raise RuntimeError("password-maximum-chars max-value missing from definition")


def _policy_from_config(config: BaseModel) -> tuple[int, int, int, int]:
    return (
        int(getattr(config, "password_minimum_chars")),
        int(getattr(config, "password_maximum_chars")),
        int(getattr(config, "password_guess_per_second")),
        int(getattr(config, "password_acceptable_crack_time_days")),
    )


def _policy_substitutes() -> tuple[int, int, int, int]:
    # Lazy import: avoid auth → system_config → records → auth cycle at import time.
    from untangled.system_config.bootstrap import SYSTEM_CONFIG_DEFAULTS

    return (
        int(SYSTEM_CONFIG_DEFAULTS["password_minimum_chars"]),
        int(SYSTEM_CONFIG_DEFAULTS["password_maximum_chars"]),
        int(SYSTEM_CONFIG_DEFAULTS["password_guess_per_second"]),
        int(SYSTEM_CONFIG_DEFAULTS["password_acceptable_crack_time_days"]),
    )


def change_password(
    conn: Connection,
    user: dict[str, Any],
    *,
    current_password: str | None,
    new_password: str | None,
    verify_new_password: str | None,
) -> tuple[bool, str]:
    """Run the always-on post-auth change-password pipeline.

    Returns ``(ok, detail)``. Persists a new Argon2id hash only on full success.
    Dummy/current substitutes are never written.
    """
    # Lazy imports: auth routes load this module; seed→auth must stay acyclic.
    from untangled.system_config import SystemConfigUnreadableError, get_system_config

    validation_state = True

    try:
        config = get_system_config(conn)
        min_chars, max_chars, guess_per_second, acceptable_days = _policy_from_config(
            config
        )
    except SystemConfigUnreadableError:
        validation_state = False
        min_chars, max_chars, guess_per_second, acceptable_days = _policy_substitutes()

    # Step 2 — current-password input bound (schema max-value, not live config).
    schema_max = _schema_password_maximum_chars_bound()
    current = current_password
    if current is None or current == "" or len(current) > schema_max:
        validation_state = False
        current = _DUMMY_CURRENT_PASSWORD

    # Step 3 — account active / not locked.
    if not user["is_active"]:
        validation_state = False

    # Step 4 — always verify current (real or dummy) against stored hash.
    if not verify_password(user["password_hash"], current):
        validation_state = False

    # Step 5 — new-password policy (each check always runs).
    new_pw = "" if new_password is None else new_password
    verify_pw = "" if verify_new_password is None else verify_new_password

    if new_pw != verify_pw:
        validation_state = False
    if new_pw == current:
        validation_state = False
    if not (min_chars <= len(new_pw) <= max_chars):
        validation_state = False
    if not password_strength_ok(
        new_pw,
        username=user["username"],
        display_name=user["display_name"],
        guess_per_second=guess_per_second,
        acceptable_crack_time_days=acceptable_days,
    ):
        validation_state = False

    # Step 6 — persist only on full success.
    if not validation_state:
        return False, _FAILURE

    new_hash = hash_password(new_pw)
    user_id: UUID = user["id"]
    update_user_password_hash(conn, user_id, new_hash, actor_id=user_id)
    return True, _SUCCESS
