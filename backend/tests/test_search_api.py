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
    response = _search(tickets_client, "/api/v2/incident/search", {})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["limit"] == 20
    assert body["offset"] == 0
    assert body["total"] >= 2
    assert len(body["items"]) >= 2
    for item in body["items"]:
        assert set(item.keys()) == {"id"}


def test_search_null_predicate_match_all(tickets_client: TestClient) -> None:
    response = _search(tickets_client, "/api/v2/incident/search", {"predicate": None})
    assert response.status_code == 200
    assert response.json()["total"] >= 2


def test_search_eq_and_projection(tickets_client: TestClient) -> None:
    response = _search(
        tickets_client,
        "/api/v2/incident/search",
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
        "/api/v2/incident/search",
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
        "/api/v2/incident/search",
        {
            "predicate": {"op": "not_empty", "attribute": "description"},
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
        "/api/v2/incident/search",
        {"limit": 1, "offset": 0, "attributes": ["summary"]},
    )
    page2 = _search(
        tickets_client,
        "/api/v2/incident/search",
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
        "/api/v2/incident/search",
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
        "/api/v2/incident/search",
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


def test_search_sort_direction_defaults_to_asc(tickets_client: TestClient) -> None:
    """Omitted or null direction is asc; must match explicit asc and differ from desc."""
    body_common = {"attributes": ["status"], "limit": 50}
    omit = _search(
        tickets_client,
        "/api/v2/incident/search",
        {**body_common, "sort": [{"attribute": "status"}]},
    )
    null_direction = _search(
        tickets_client,
        "/api/v2/incident/search",
        {**body_common, "sort": [{"attribute": "status", "direction": None}]},
    )
    explicit_asc = _search(
        tickets_client,
        "/api/v2/incident/search",
        {**body_common, "sort": [{"attribute": "status", "direction": "asc"}]},
    )
    explicit_desc = _search(
        tickets_client,
        "/api/v2/incident/search",
        {**body_common, "sort": [{"attribute": "status", "direction": "desc"}]},
    )
    assert omit.status_code == 200, omit.text
    assert null_direction.status_code == 200, null_direction.text
    assert explicit_asc.status_code == 200
    assert explicit_desc.status_code == 200

    omit_ids = [item["id"] for item in omit.json()["items"]]
    null_ids = [item["id"] for item in null_direction.json()["items"]]
    asc_ids = [item["id"] for item in explicit_asc.json()["items"]]
    desc_ids = [item["id"] for item in explicit_desc.json()["items"]]
    assert omit_ids == asc_ids == null_ids
    assert omit_ids != desc_ids
    assert [item["status"] for item in omit.json()["items"]] == sorted(
        item["status"] for item in omit.json()["items"]
    )

    # Direction values are case-sensitive; only lowercase asc/desc are valid.
    for bad in ("ASC", "DESC", "Asc", "deSc"):
        response = _search(
            tickets_client,
            "/api/v2/incident/search",
            {**body_common, "sort": [{"attribute": "status", "direction": bad}]},
        )
        assert response.status_code == 422, (bad, response.text)


def test_search_empty_result_is_200(tickets_client: TestClient) -> None:
    response = _search(
        tickets_client,
        "/api/v2/incident/search",
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
        "/api/v2/change_request/search",
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


def test_search_ordered_ops(tickets_client: TestClient) -> None:
    # string gt on seed incident status vocabulary
    status_gt = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {"op": "gt", "attribute": "status", "value": "m"},
            "attributes": ["status"],
        },
    )
    assert status_gt.status_code == 200, status_gt.text
    assert status_gt.json()["total"] >= 1
    for item in status_gt.json()["items"]:
        assert item["status"] > "m"

    # friendly_id starts_with-style bound via gte on INC numbers
    number_gte = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {"op": "gte", "attribute": "number", "value": "INC"},
            "attributes": ["number"],
        },
    )
    assert number_gte.status_code == 200, number_gte.text
    assert number_gte.json()["total"] >= 2

    # datetime lt far-future created_at matches existing rows
    created = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "lt",
                "attribute": "created_at",
                "value": "2099-01-01T00:00:00Z",
            },
            "attributes": ["created_at"],
        },
    )
    assert created.status_code == 200, created.text
    assert created.json()["total"] >= 2

    # integer ordered ops on change-requests (shared factory path)
    high_risk = _search(
        tickets_client,
        "/api/v2/change_request/search",
        {
            "predicate": {"op": "gte", "attribute": "risk_score", "value": 50},
            "attributes": ["risk_score", "summary"],
        },
    )
    assert high_risk.status_code == 200, high_risk.text
    assert high_risk.json()["total"] >= 1
    for item in high_risk.json()["items"]:
        assert item["risk_score"] >= 50

    low_risk = _search(
        tickets_client,
        "/api/v2/change_request/search",
        {
            "predicate": {"op": "lt", "attribute": "risk_score", "value": 50},
            "attributes": ["risk_score"],
        },
    )
    assert low_risk.status_code == 200, low_risk.text
    assert low_risk.json()["total"] >= 1
    for item in low_risk.json()["items"]:
        assert item["risk_score"] < 50


def test_search_ordered_text_uses_c_collation(tickets_client: TestClient) -> None:
    """C puts uppercase before lowercase; typical en_US does not.

    Fixture: summary 'Zebra' vs bound 'apple'. Under COLLATE \"C\",
    'Zebra' < 'apple' is true; under a common locale primary strength,
    case folds and 'apple' < 'Zebra'. This must stay discriminating —
    do not simplify to a pair that orders the same under both collations.
    """
    headers = _headers(tickets_client, "readwrite")
    created = tickets_client.post(
        "/api/v2/incident",
        headers=headers,
        json={
            "summary": "Zebra",
            "status": "new",
            "severity": "Low",
        },
    )
    assert created.status_code == 201, created.text
    zebra_id = created.json()["id"]

    response = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {"op": "lt", "attribute": "summary", "value": "apple"},
            "attributes": ["summary"],
        },
    )
    assert response.status_code == 200, response.text
    ids = {item["id"] for item in response.json()["items"]}
    assert zebra_id in ids


def test_search_ordered_null_does_not_match(tickets_client: TestClient) -> None:
    # Seed incident 2 has description NULL — ordered ops must not match it.
    response = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "and",
                "predicates": [
                    {"op": "eq", "attribute": "status", "value": "in-progress"},
                    {"op": "gt", "attribute": "description", "value": ""},
                ],
            },
            "attributes": ["description", "status"],
        },
    )
    assert response.status_code == 200, response.text
    ids = {item["id"] for item in response.json()["items"]}
    assert str(SEED_INCIDENT_2_ID) not in ids


def test_search_ordered_type_rejection(tickets_client: TestClient) -> None:
    for attribute, value in (
        ("id", "01900000-0000-7000-8000-000000000021"),
        ("assigned_user_id", "01900000-0000-7000-8000-000000000001"),
        ("major_incident", True),
    ):
        response = _search(
            tickets_client,
            "/api/v2/incident/search",
            {"predicate": {"op": "gt", "attribute": attribute, "value": value}},
        )
        assert response.status_code == 422, (attribute, response.text)


def test_search_text_pattern_ops(tickets_client: TestClient) -> None:
    # contains / starts_with / ends_with / regexp against seed incident 1.
    contains = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "contains",
                "attribute": "summary",
                "value": "outbound",
            },
            "attributes": ["summary"],
        },
    )
    assert contains.status_code == 200, contains.text
    ids = {item["id"] for item in contains.json()["items"]}
    assert str(SEED_INCIDENT_1_ID) in ids

    starts = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "starts_with",
                "attribute": "summary",
                "value": "Email",
            },
            "attributes": ["summary"],
        },
    )
    assert starts.status_code == 200
    assert str(SEED_INCIDENT_1_ID) in {i["id"] for i in starts.json()["items"]}

    ends = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "ends_with",
                "attribute": "summary",
                "value": "delayed",
            },
            "attributes": ["summary"],
        },
    )
    assert ends.status_code == 200
    assert str(SEED_INCIDENT_1_ID) in {i["id"] for i in ends.json()["items"]}

    regexp = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "regexp",
                "attribute": "summary",
                "value": r"^Email.*delayed$",
            },
            "attributes": ["summary"],
        },
    )
    assert regexp.status_code == 200
    assert str(SEED_INCIDENT_1_ID) in {i["id"] for i in regexp.json()["items"]}

    # friendly_id starts_with on change-requests (shared factory path).
    chg = _search(
        tickets_client,
        "/api/v2/change_request/search",
        {
            "predicate": {
                "op": "starts_with",
                "attribute": "number",
                "value": "CHG",
            },
            "attributes": ["number"],
        },
    )
    assert chg.status_code == 200, chg.text
    assert chg.json()["total"] >= 1
    for item in chg.json()["items"]:
        assert item["number"].startswith("CHG")


def test_search_text_pattern_case_sensitive(tickets_client: TestClient) -> None:
    response = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "contains",
                "attribute": "summary",
                "value": "EMAIL",
            }
        },
    )
    assert response.status_code == 200
    assert str(SEED_INCIDENT_1_ID) not in {i["id"] for i in response.json()["items"]}


def test_search_text_pattern_like_literals(tickets_client: TestClient) -> None:
    headers = _headers(tickets_client, "readwrite")
    created = tickets_client.post(
        "/api/v2/incident",
        headers=headers,
        json={
            "summary": "100%_done marker",
            "status": "new",
            "severity": "Low",
        },
    )
    assert created.status_code == 201, created.text
    created_id = created.json()["id"]

    # Wildcard chars in the value must match literally, not as LIKE wildcards.
    response = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "contains",
                "attribute": "summary",
                "value": "100%_done",
            },
            "attributes": ["summary"],
        },
    )
    assert response.status_code == 200, response.text
    ids = {item["id"] for item in response.json()["items"]}
    assert created_id in ids

    # A lone % must not match every row as a LIKE wildcard.
    wild = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "contains",
                "attribute": "summary",
                "value": "%",
            },
            "attributes": ["summary"],
        },
    )
    assert wild.status_code == 200
    wild_ids = {item["id"] for item in wild.json()["items"]}
    assert created_id in wild_ids
    # Seed summaries have no literal % — only the created row should match.
    assert str(SEED_INCIDENT_1_ID) not in wild_ids
    assert str(SEED_INCIDENT_2_ID) not in wild_ids


def test_search_text_pattern_type_rejection_and_invalid_regexp(
    tickets_client: TestClient,
) -> None:
    for attribute in ("id", "created_at"):
        response = _search(
            tickets_client,
            "/api/v2/incident/search",
            {
                "predicate": {
                    "op": "contains",
                    "attribute": attribute,
                    "value": "x",
                }
            },
        )
        assert response.status_code == 422, (attribute, response.text)

    bad_re = _search(
        tickets_client,
        "/api/v2/incident/search",
        {
            "predicate": {
                "op": "regexp",
                "attribute": "summary",
                "value": "(",
            }
        },
    )
    assert bad_re.status_code == 422, bad_re.text
    assert "regular expression" in bad_re.json()["detail"].lower()


def test_search_unauthenticated_401(tickets_client: TestClient) -> None:
    assert tickets_client.post("/api/v2/incident/search", json={}).status_code == 401


def test_search_guardrails_and_validation_422(tickets_client: TestClient) -> None:
    # Depth: seeded max_search_nesting_depth = 3 (root depth 1).
    deep = {"op": "eq", "attribute": "status", "value": "new"}
    for _ in range(3):
        deep = {"op": "not", "predicate": deep}
    # depth: root=1, three nots → depth 4 at leaf → exceed max 3
    deep = {"op": "not", "predicate": deep}
    deep_resp = _search(tickets_client, "/api/v2/incident/search", {"predicate": deep})
    assert deep_resp.status_code == 422
    assert "max_search_nesting_depth" in deep_resp.json()["detail"]

    # Length: seeded max_search_nesting_length = 20 (was hard-coded 50).
    too_wide = {
        "op": "and",
        "predicates": [
            {"op": "eq", "attribute": "status", "value": "new"} for _ in range(21)
        ],
    }
    wide_resp = _search(tickets_client, "/api/v2/incident/search", {"predicate": too_wide})
    assert wide_resp.status_code == 422
    assert "max_search_nesting_length" in wide_resp.json()["detail"]

    # Total predicates: seeded max_search_total_predicates = 50.
    # Stay within length (20) and depth (3): or of 17 ands × 3 eqs → 69 nodes.
    too_many = {
        "op": "or",
        "predicates": [
            {
                "op": "and",
                "predicates": [
                    {"op": "eq", "attribute": "status", "value": "new"},
                    {"op": "eq", "attribute": "status", "value": "new"},
                    {"op": "eq", "attribute": "status", "value": "new"},
                ],
            }
            for _ in range(17)
        ],
    }
    many_resp = _search(tickets_client, "/api/v2/incident/search", {"predicate": too_many})
    assert many_resp.status_code == 422
    assert "max_search_total_predicates" in many_resp.json()["detail"]

    # Total regexp: seeded max_search_total_regexp = 3.
    too_regexp = {
        "op": "or",
        "predicates": [
            {"op": "regexp", "attribute": "summary", "value": "a"},
            {"op": "regexp", "attribute": "summary", "value": "b"},
            {"op": "regexp", "attribute": "summary", "value": "c"},
            {"op": "regexp", "attribute": "summary", "value": "d"},
        ],
    }
    regexp_resp = _search(
        tickets_client, "/api/v2/incident/search", {"predicate": too_regexp}
    )
    assert regexp_resp.status_code == 422
    assert "max_search_total_regexp" in regexp_resp.json()["detail"]

    # Search compiler semantic/value failures → 422.
    semantic_cases = [
        {"limit": 0},
        {"limit": 201},
        {"offset": -1},
        {"attributes": ["not_a_real_field"]},
        {
            "predicate": {
                "op": "eq",
                "attribute": "status",
                "value": None,
            }
        },
        {"predicate": {"op": "gt", "attribute": "major_incident", "value": True}},
        {"predicate": {"op": "bogus", "attribute": "status", "value": "a"}},
        {"predicate": {"op": "starts-with", "attribute": "summary", "value": "x"}},
        {"predicate": {"op": "ends-with", "attribute": "summary", "value": "x"}},
        {"predicate": {"op": "not-empty", "attribute": "description"}},
        {"sort": [{"attribute": "not_a_real_field", "direction": "asc"}]},
    ]
    for body in semantic_cases:
        response = _search(tickets_client, "/api/v2/incident/search", body)
        assert response.status_code == 422, (body, response.text)

    # Malformed predicate shape / unexpected keys / absent required children → 400.
    structural_cases = [
        {"predicate": {"op": "empty", "attribute": "status", "value": "x"}},
        {"predicate": {"op": "eq", "attribute": "status"}},
        {"predicate": {"op": "eq", "value": "new"}},
        {"predicate": {"op": "and", "predicates": []}},
        {"not_a_field": True},
        {"sort": {"attribute": "status", "direction": "asc"}},
        {"attributes": "status"},
    ]
    for body in structural_cases:
        response = _search(tickets_client, "/api/v2/incident/search", body)
        assert response.status_code == 400, (body, response.text)

    # Framework / Pydantic validation (enum) → 422 (data / value error).
    bad_direction = _search(
        tickets_client,
        "/api/v2/incident/search",
        {"sort": [{"attribute": "status", "direction": "sideways"}]},
    )
    assert bad_direction.status_code == 422, bad_direction.text

    # Typed-field scalar mismatch on the envelope → 422.
    bad_limit_type = _search(
        tickets_client,
        "/api/v2/incident/search",
        {"limit": "twenty"},
    )
    assert bad_limit_type.status_code == 422, bad_limit_type.text


def test_search_unreadable_system_config_503(
    tickets_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from untangled.system_config import SystemConfigUnreadableError

    def _boom(_conn, *, cache=None):
        raise SystemConfigUnreadableError("system_config singleton could not be read")

    monkeypatch.setattr(
        "untangled.records.v2_router_factory.get_system_config",
        _boom,
    )
    response = _search(tickets_client, "/api/v2/incident/search", {})
    assert response.status_code == 503, response.text
    detail = response.json()["detail"].lower()
    assert "system configuration" in detail
    assert "search cannot run" in detail
