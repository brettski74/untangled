"""DB-backed tests for generic POST /{collection}/search (slice A)."""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from psycopg import Connection

from untangled.main import app
from untangled.seed.tickets import SEED_INCIDENT_1_ID, SEED_INCIDENT_2_ID
from untangled.seed.users import SEED_USERS, password_for


@pytest.fixture
def tickets_client(demo_schema, db_conn: Connection) -> Iterator[TestClient]:
    assert demo_schema
    with TestClient(app) as client:
        yield client


def _login(client: TestClient, username: str, password: str):
    return client.post(
        "/auth/login",
        data={"username": username, "password": password},
    )


def _bearer(client: TestClient, username: str) -> str:
    seed = next(s for s in SEED_USERS if s.username == username)
    login = _login(client, seed.username, password_for(seed))
    assert login.status_code == 200
    return login.json()["access_token"]


def _headers(client: TestClient, username: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {_bearer(client, username)}"}


def _search(
    client: TestClient,
    path: str,
    body: dict,
    *,
    username: str = "readonly",
):
    return client.post(path, headers=_headers(client, username), json=body)


def test_search_match_all_defaults(tickets_client: TestClient) -> None:
    response = _search(tickets_client, "/incidents/search", {})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["limit"] == 20
    assert body["offset"] == 0
    assert body["total"] >= 2
    assert len(body["items"]) >= 2
    for item in body["items"]:
        assert set(item.keys()) == {"id"}


def test_search_null_predicate_match_all(tickets_client: TestClient) -> None:
    response = _search(tickets_client, "/incidents/search", {"predicate": None})
    assert response.status_code == 200
    assert response.json()["total"] >= 2


def test_search_eq_and_projection(tickets_client: TestClient) -> None:
    response = _search(
        tickets_client,
        "/incidents/search",
        {
            "predicate": {
                "op": "eq",
                "attribute": "status",
                "value": "new",
            },
            "attributes": ["number", "summary", "status", "number"],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] >= 1
    item = next(i for i in body["items"] if i["id"] == str(SEED_INCIDENT_1_ID))
    assert list(item.keys()) == ["id", "number", "summary", "status"]
    assert item["status"] == "new"
    assert item["summary"] == "Email outbound delayed"


def test_search_and_or_not_ne_empty(tickets_client: TestClient) -> None:
    # Seed incident 2 has description NULL and status in-progress.
    response = _search(
        tickets_client,
        "/incidents/search",
        {
            "predicate": {
                "op": "and",
                "predicates": [
                    {
                        "op": "or",
                        "predicates": [
                            {
                                "op": "eq",
                                "attribute": "status",
                                "value": "in-progress",
                            },
                            {
                                "op": "eq",
                                "attribute": "status",
                                "value": "new",
                            },
                        ],
                    },
                    {
                        "op": "not",
                        "predicate": {
                            "op": "ne",
                            "attribute": "severity",
                            "value": "High",
                        },
                    },
                    {"op": "empty", "attribute": "description"},
                ],
            },
            "attributes": ["status", "severity", "description"],
        },
    )
    assert response.status_code == 200, response.text
    body = response.json()
    ids = {item["id"] for item in body["items"]}
    assert str(SEED_INCIDENT_2_ID) in ids
    for item in body["items"]:
        assert item["description"] is None
        assert item["severity"] == "High"


def test_search_not_empty(tickets_client: TestClient) -> None:
    response = _search(
        tickets_client,
        "/incidents/search",
        {
            "predicate": {"op": "not-empty", "attribute": "description"},
            "attributes": ["description"],
        },
    )
    assert response.status_code == 200
    assert response.json()["total"] >= 1
    for item in response.json()["items"]:
        assert item["description"] is not None


def test_search_pagination_and_total(tickets_client: TestClient) -> None:
    page1 = _search(
        tickets_client,
        "/incidents/search",
        {"limit": 1, "offset": 0, "attributes": ["summary"]},
    )
    page2 = _search(
        tickets_client,
        "/incidents/search",
        {"limit": 1, "offset": 1, "attributes": ["summary"]},
    )
    assert page1.status_code == 200 and page2.status_code == 200
    assert page1.json()["total"] == page2.json()["total"]
    assert page1.json()["total"] >= 2
    assert len(page1.json()["items"]) == 1
    assert len(page2.json()["items"]) == 1
    assert page1.json()["items"][0]["id"] != page2.json()["items"][0]["id"]


def test_search_sort_stability_and_explicit_created_at(tickets_client: TestClient) -> None:
    response = _search(
        tickets_client,
        "/incidents/search",
        {
            "sort": [{"attribute": "status", "direction": "asc"}],
            "attributes": ["status"],
            "limit": 50,
        },
    )
    assert response.status_code == 200
    statuses = [item["status"] for item in response.json()["items"]]
    assert statuses == sorted(statuses)

    # Explicit created_at / id directions are respected (no duplicate append).
    response2 = _search(
        tickets_client,
        "/incidents/search",
        {
            "sort": [
                {"attribute": "created_at", "direction": "asc"},
                {"attribute": "id", "direction": "asc"},
            ],
            "limit": 50,
        },
    )
    assert response2.status_code == 200
    ids = [item["id"] for item in response2.json()["items"]]
    assert ids == sorted(ids)


def test_search_empty_result_is_200(tickets_client: TestClient) -> None:
    response = _search(
        tickets_client,
        "/incidents/search",
        {
            "predicate": {
                "op": "eq",
                "attribute": "summary",
                "value": "no-such-incident-summary-zzz",
            }
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"] == 0


def test_search_change_requests_endpoint(tickets_client: TestClient) -> None:
    response = _search(
        tickets_client,
        "/change-requests/search",
        {
            "predicate": {"op": "eq", "attribute": "status", "value": "draft"},
            "attributes": ["number", "status"],
        },
    )
    assert response.status_code == 200, response.text
    assert response.json()["total"] >= 1
    for item in response.json()["items"]:
        assert item["status"] == "draft"
        assert item["number"].startswith("CHG")


def test_search_unauthenticated_401(tickets_client: TestClient) -> None:
    assert tickets_client.post("/incidents/search", json={}).status_code == 401


def test_search_guardrails_and_validation_400(tickets_client: TestClient) -> None:
    deep = {"op": "eq", "attribute": "status", "value": "new"}
    for _ in range(3):
        deep = {"op": "not", "predicate": deep}
    # depth: root=1, three nots → depth 4 at leaf → exceed max 3
    deep = {"op": "not", "predicate": deep}
    assert _search(tickets_client, "/incidents/search", {"predicate": deep}).status_code == 400

    too_wide = {
        "op": "and",
        "predicates": [
            {"op": "eq", "attribute": "status", "value": "new"} for _ in range(51)
        ],
    }
    assert (
        _search(tickets_client, "/incidents/search", {"predicate": too_wide}).status_code
        == 400
    )

    cases = [
        {"limit": 0},
        {"limit": 201},
        {"offset": -1},
        {"sort": [{"attribute": "status", "direction": "sideways"}]},
        {"attributes": ["not_a_real_field"]},
        {
            "predicate": {
                "op": "eq",
                "attribute": "status",
                "value": None,
            }
        },
        {"predicate": {"op": "gt", "attribute": "status", "value": "a"}},
        {"predicate": {"op": "bogus", "attribute": "status", "value": "a"}},
        {"predicate": {"op": "and", "predicates": []}},
        {"predicate": {"op": "empty", "attribute": "status", "value": "x"}},
    ]
    for body in cases:
        response = _search(tickets_client, "/incidents/search", body)
        assert response.status_code == 400, (body, response.text)
