"""DB-backed tests for POST /auth/change-password."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from jwt_mint import bearer_for
from psycopg import Connection, sql
from psycopg.rows import dict_row

from untangled.auth.passwords import verify_password
from untangled.auth.store import authenticate_user
from untangled.main import app
from untangled.mapping.well_known import SYSTEM_CONFIG_ID
from untangled.seed.users import SEED_USERS, password_for
from untangled.system_config.cache import default_cache

_STRONG_NEW = "orchid-lantern-quasar-7N!pQ2xm"
# >72 chars: exercises zxcvbn truncate-for-score (library max), not product max.
_STRONG_LONG = (
    "orchid-lantern-quasar-7N!pQ2xm-wX9mK2pL7vN4qR8sT1uY3zA5bC6dE0fG8hJ1kLm4nP6"
)
_FAILURE = "Password change failed."
_SUCCESS = "Password change complete."


@pytest.fixture
def auth_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    default_cache.invalidate()
    with TestClient(app) as client:
        yield client


def _bearer(_client: TestClient, username: str, password: str | None = None) -> str:
    return bearer_for(username)


def _change(
    client: TestClient,
    token: str,
    *,
    current: str | None,
    new: str | None,
    verify: str | None,
):
    body: dict[str, str | None] = {
        "current_password": current,
        "new_password": new,
        "verify_new_password": verify,
    }
    return client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json=body,
    )


def _password_hash(db_conn: Connection, user_id) -> str:
    with db_conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            sql.SQL("SELECT password_hash FROM {} WHERE id = {}").format(
                sql.Identifier("user"),
                sql.Placeholder(),
            ),
            (user_id,),
        )
        row = cur.fetchone()
    assert row is not None
    return row["password_hash"]


def test_change_password_success_updates_hash_and_keeps_session(
    auth_client: TestClient,
    db_conn: Connection,
) -> None:
    admin = SEED_USERS[0]
    old_hash = _password_hash(db_conn, admin.id)
    token = _bearer(auth_client, admin.username)
    response = _change(
        auth_client,
        token,
        current=password_for(admin),
        new=_STRONG_NEW,
        verify=_STRONG_NEW,
    )
    assert response.status_code == 200
    body = response.json()
    assert body == {"detail": _SUCCESS}
    assert "password_hash" not in body
    assert _STRONG_NEW not in response.text
    assert password_for(admin) not in response.text

    new_hash = _password_hash(db_conn, admin.id)
    assert new_hash != old_hash
    assert verify_password(new_hash, _STRONG_NEW)
    assert not verify_password(new_hash, password_for(admin))

    # Existing access token still works; store auth accepts new password only.
    me = auth_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
    assert me.status_code == 200
    assert authenticate_user(db_conn, admin.username, _STRONG_NEW) is not None
    assert authenticate_user(db_conn, admin.username, password_for(admin)) is None


@pytest.mark.parametrize(
    "current,new,verify",
    [
        ("wrong-password", _STRONG_NEW, _STRONG_NEW),
        ("__CURRENT__", _STRONG_NEW, _STRONG_NEW + "x"),
        ("__CURRENT__", "short", "short"),
        ("__CURRENT__", "password", "password"),
        ("__CURRENT__", "__CURRENT__", "__CURRENT__"),
        (None, _STRONG_NEW, _STRONG_NEW),
        ("", _STRONG_NEW, _STRONG_NEW),
        ("__CURRENT__", None, None),
    ],
)
def test_change_password_uniform_422_failure_modes(
    auth_client: TestClient,
    db_conn: Connection,
    current: str | None,
    new: str | None,
    verify: str | None,
) -> None:
    admin = SEED_USERS[0]
    current_pw = password_for(admin)

    def _resolve(value: str | None) -> str | None:
        if value == "__CURRENT__":
            return current_pw
        return value

    before = _password_hash(db_conn, admin.id)
    token = _bearer(auth_client, admin.username)
    response = _change(
        auth_client,
        token,
        current=_resolve(current),
        new=_resolve(new),
        verify=_resolve(verify),
    )
    assert response.status_code == 422
    assert response.json() == {"detail": _FAILURE}
    assert _password_hash(db_conn, admin.id) == before


def test_change_password_unauthenticated_is_401_without_persist(
    auth_client: TestClient,
    db_conn: Connection,
) -> None:
    admin = SEED_USERS[0]
    before = _password_hash(db_conn, admin.id)
    response = auth_client.post(
        "/auth/change-password",
        json={
            "current_password": password_for(admin),
            "new_password": _STRONG_NEW,
            "verify_new_password": _STRONG_NEW,
        },
    )
    assert response.status_code == 401
    assert _password_hash(db_conn, admin.id) == before

    bad = auth_client.post(
        "/auth/change-password",
        headers={"Authorization": "Bearer not-a-jwt"},
        json={
            "current_password": password_for(admin),
            "new_password": _STRONG_NEW,
            "verify_new_password": _STRONG_NEW,
        },
    )
    assert bad.status_code == 401
    assert _password_hash(db_conn, admin.id) == before


def test_change_password_inactive_user_uniform_422(
    auth_client: TestClient,
    db_conn: Connection,
) -> None:
    admin = SEED_USERS[0]
    token = _bearer(auth_client, admin.username)
    before = _password_hash(db_conn, admin.id)

    db_conn.execute(
        sql.SQL("UPDATE {} SET is_active = FALSE WHERE id = {}").format(
            sql.Identifier("user"),
            sql.Placeholder(),
        ),
        (admin.id,),
    )
    db_conn.commit()

    response = _change(
        auth_client,
        token,
        current=password_for(admin),
        new=_STRONG_NEW,
        verify=_STRONG_NEW,
    )
    assert response.status_code == 422
    assert response.json() == {"detail": _FAILURE}
    assert _password_hash(db_conn, admin.id) == before


def test_change_password_config_unreadable_fail_closed(
    auth_client: TestClient,
    db_conn: Connection,
) -> None:
    admin = SEED_USERS[0]
    token = _bearer(auth_client, admin.username)
    before = _password_hash(db_conn, admin.id)

    db_conn.execute(
        "DELETE FROM system_config WHERE id = %s",
        (SYSTEM_CONFIG_ID,),
    )
    db_conn.commit()
    default_cache.invalidate()

    response = _change(
        auth_client,
        token,
        current=password_for(admin),
        new=_STRONG_NEW,
        verify=_STRONG_NEW,
    )
    assert response.status_code == 422
    assert response.json() == {"detail": _FAILURE}
    assert _password_hash(db_conn, admin.id) == before


def test_change_password_omitted_fields_reach_pipeline(
    auth_client: TestClient,
    db_conn: Connection,
) -> None:
    """Missing keys must not short-circuit as required-field 400."""
    admin = SEED_USERS[0]
    before = _password_hash(db_conn, admin.id)
    token = _bearer(auth_client, admin.username)
    response = auth_client.post(
        "/auth/change-password",
        headers={"Authorization": f"Bearer {token}"},
        json={},
    )
    assert response.status_code == 422
    assert response.json() == {"detail": _FAILURE}
    assert _password_hash(db_conn, admin.id) == before


def test_change_password_structural_body_is_400(
    auth_client: TestClient,
) -> None:
    token = _bearer(auth_client, "admin")
    response = auth_client.post(
        "/auth/change-password",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        },
        content=b"{not-json",
    )
    assert response.status_code == 400


def test_change_password_longer_than_zxcvbn_max_does_not_500(
    auth_client: TestClient,
    db_conn: Connection,
) -> None:
    """Passwords >72 chars must not 500; success path still updates the hash."""
    assert len(_STRONG_LONG) > 72
    admin = SEED_USERS[0]
    token = _bearer(auth_client, admin.username)
    response = _change(
        auth_client,
        token,
        current=password_for(admin),
        new=_STRONG_LONG,
        verify=_STRONG_LONG,
    )
    assert response.status_code == 200
    assert response.json() == {"detail": _SUCCESS}
    assert verify_password(_password_hash(db_conn, admin.id), _STRONG_LONG)


def test_change_password_weak_long_prefix_is_uniform_422(
    auth_client: TestClient,
    db_conn: Connection,
) -> None:
    """Weak scored prefix with length >72 still fails as generic 422."""
    weak_long = "password" + ("x" * 65)
    assert len(weak_long) == 73
    admin = SEED_USERS[0]
    before = _password_hash(db_conn, admin.id)
    token = _bearer(auth_client, admin.username)
    response = _change(
        auth_client,
        token,
        current=password_for(admin),
        new=weak_long,
        verify=weak_long,
    )
    assert response.status_code == 422
    assert response.json() == {"detail": _FAILURE}
    assert _password_hash(db_conn, admin.id) == before
