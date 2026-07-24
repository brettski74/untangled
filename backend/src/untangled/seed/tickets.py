"""Idempotent seed of sample Incident and Change Request rows."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from uuid import UUID

from psycopg import Connection

from untangled.mapping.definition import load_definition
from untangled.persistence.store import RecordStore
from untangled.records.deps import definitions_dir, model
from untangled.seed.users import SEED_ADMIN_ID, SEED_READWRITE_ID

# Stable UUIDs for docs / re-seed fetch-by-id. Friendly numbers are sequence-local.
SEED_INCIDENT_1_ID = UUID("01900000-0000-7000-8000-000000000021")
SEED_INCIDENT_2_ID = UUID("01900000-0000-7000-8000-000000000022")
SEED_CHANGE_1_ID = UUID("01900000-0000-7000-8000-000000000031")
SEED_CHANGE_2_ID = UUID("01900000-0000-7000-8000-000000000032")


def seed_tickets(conn: Connection) -> dict[str, list[str]]:
    """Upsert sample INC/CHG rows via RecordStore. Returns created/skipped summaries."""
    defs = definitions_dir()
    incident_def = load_definition(defs / "incident.yaml")
    change_def = load_definition(defs / "change-request.yaml")
    incident_store = RecordStore(
        conn, incident_def, model("incident"), actor_id=SEED_ADMIN_ID
    )
    change_store = RecordStore(
        conn, change_def, model("change-request"), actor_id=SEED_ADMIN_ID
    )

    now = datetime.now(timezone.utc)
    incidents: list[str] = []
    for row_id, fields in (
        (
            SEED_INCIDENT_1_ID,
            {
                "summary": "Email outbound delayed",
                "description": "Users report delayed outbound mail.",
                "status": "new",
                "severity": "Medium",
                "assigned_user_id": SEED_READWRITE_ID,
            },
        ),
        (
            SEED_INCIDENT_2_ID,
            {
                "summary": "VPN intermittent drops",
                "description": None,
                "status": "in-progress",
                "severity": "High",
                "assigned_user_id": None,
            },
        ),
    ):
        if incident_store.fetch_by_id(row_id) is None:
            created = incident_store.create(fields, row_id=row_id)
            incidents.append(f"created:{created.number}")
        else:
            incidents.append(f"exists:{row_id}")

    changes: list[str] = []
    for row_id, fields in (
        (
            SEED_CHANGE_1_ID,
            {
                "summary": "Patch mail relays",
                "description": "Scheduled OS patches on mail relays.",
                "status": "scheduled",
                "scheduled_start": now + timedelta(days=1),
                "scheduled_end": now + timedelta(days=1, hours=2),
                "assigned_user_id": SEED_READWRITE_ID,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
        (
            SEED_CHANGE_2_ID,
            {
                "summary": "Firewall rule tidy-up",
                "description": None,
                "status": "draft",
                "scheduled_start": now + timedelta(days=3),
                "scheduled_end": now + timedelta(days=3, hours=1),
                "assigned_user_id": None,
                "requested_by": SEED_READWRITE_ID,
            },
        ),
    ):
        if change_store.fetch_by_id(row_id) is None:
            created = change_store.create(fields, row_id=row_id)
            changes.append(f"created:{created.number}")
        else:
            changes.append(f"exists:{row_id}")

    return {"incidents": incidents, "change_requests": changes}
