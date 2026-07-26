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
SEED_INCIDENT_3_ID = UUID("01900000-0000-7000-8000-000000000023")
SEED_INCIDENT_4_ID = UUID("01900000-0000-7000-8000-000000000024")
SEED_INCIDENT_5_ID = UUID("01900000-0000-7000-8000-000000000025")
SEED_INCIDENT_6_ID = UUID("01900000-0000-7000-8000-000000000026")
SEED_CHANGE_1_ID = UUID("01900000-0000-7000-8000-000000000031")
SEED_CHANGE_2_ID = UUID("01900000-0000-7000-8000-000000000032")
SEED_CHANGE_3_ID = UUID("01900000-0000-7000-8000-000000000033")
SEED_CHANGE_4_ID = UUID("01900000-0000-7000-8000-000000000034")
SEED_CHANGE_5_ID = UUID("01900000-0000-7000-8000-000000000035")
SEED_CHANGE_6_ID = UUID("01900000-0000-7000-8000-000000000036")
SEED_CHANGE_7_ID = UUID("01900000-0000-7000-8000-000000000037")
SEED_CHANGE_8_ID = UUID("01900000-0000-7000-8000-000000000038")
SEED_CHANGE_9_ID = UUID("01900000-0000-7000-8000-000000000039")
SEED_CHANGE_10_ID = UUID("01900000-0000-7000-8000-000000000040")
SEED_CHANGE_11_ID = UUID("01900000-0000-7000-8000-000000000041")
SEED_CHANGE_12_ID = UUID("01900000-0000-7000-8000-000000000042")
SEED_CHANGE_13_ID = UUID("01900000-0000-7000-8000-000000000043")
SEED_CHANGE_14_ID = UUID("01900000-0000-7000-8000-000000000044")


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
    for row_id, fields in _incident_rows(now):
        if incident_store.fetch_by_id(row_id) is None:
            created = incident_store.create(fields, row_id=row_id)
            incidents.append(f"created:{created.number}")
        else:
            incidents.append(f"exists:{row_id}")

    changes: list[str] = []
    for row_id, fields in _change_rows(now):
        if change_store.fetch_by_id(row_id) is None:
            created = change_store.create(fields, row_id=row_id)
            changes.append(f"created:{created.number}")
        else:
            changes.append(f"exists:{row_id}")

    return {"incidents": incidents, "change_requests": changes}


def _incident_rows(now: datetime) -> list[tuple[UUID, dict]]:
    """Baseline + closed / resolved samples for list-view testing."""
    closed_medium_at = now - timedelta(days=18, hours=3)
    closed_critical_at = now - timedelta(days=9, hours=6)
    resolved_high_at = now - timedelta(days=4, hours=2)
    resolved_medium_at = now - timedelta(days=1, hours=5)

    return [
        (
            SEED_INCIDENT_1_ID,
            {
                "summary": "Email outbound delayed",
                "description": "Users report delayed outbound mail.",
                "status": "new",
                "severity": "Medium",
                "major_incident": True,
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
                "major_incident": False,
                "assigned_user_id": None,
            },
        ),
        (
            SEED_INCIDENT_3_ID,
            {
                "summary": "Printer queue stall on floor 3",
                "description": "Queue cleared after spooler restart; closed after user confirm.",
                "status": "closed",
                "severity": "Medium",
                "major_incident": False,
                "resolved_at": closed_medium_at - timedelta(hours=2),
                "closed_at": closed_medium_at,
                "assigned_user_id": SEED_READWRITE_ID,
                "resolution": "Restarted print spooler and cleared stuck jobs.",
                "resolution_type": "Application fault",
            },
        ),
        (
            SEED_INCIDENT_4_ID,
            {
                "summary": "Core switch stack failover event",
                "description": "Brief campus outage during unexpected stack member reboot.",
                "status": "closed",
                "severity": "Critical",
                "major_incident": True,
                "resolved_at": closed_critical_at - timedelta(hours=5),
                "closed_at": closed_critical_at,
                "assigned_user_id": SEED_ADMIN_ID,
                "resolution": "Replaced faulty stack member and restored redundancy.",
                "resolution_type": "Hardware fault",
            },
        ),
        (
            SEED_INCIDENT_5_ID,
            {
                "summary": "SSO login latency spike",
                "description": "IdP response times elevated; service restored; awaiting close.",
                "status": "resolved",
                "severity": "High",
                "major_incident": False,
                "resolved_at": resolved_high_at,
                "closed_at": None,
                "assigned_user_id": SEED_READWRITE_ID,
                "resolution": "Scaled IdP connectors and flushed stale sessions.",
                "resolution_type": "Application fault",
            },
        ),
        (
            SEED_INCIDENT_6_ID,
            {
                "summary": "Shared drive mapping fails for finance",
                "description": "GPO path corrected; users can remount; pending close.",
                "status": "resolved",
                "severity": "Medium",
                "major_incident": False,
                "resolved_at": resolved_medium_at,
                "closed_at": None,
                "assigned_user_id": None,
                "resolution": "Corrected DFS target in finance GPO.",
                "resolution_type": "User error",
            },
        ),
    ]


def _change_rows(now: datetime) -> list[tuple[UUID, dict]]:
    """Baseline + in-progress / scheduled / implemented / draft samples."""
    # In progress: window started within the last hour, ends within the next hour.
    ip1_start = now - timedelta(minutes=50)
    ip1_end = now + timedelta(minutes=40)
    ip2_start = now - timedelta(minutes=35)
    ip2_end = now + timedelta(minutes=55)
    ip3_start = now - timedelta(minutes=20)
    ip3_end = now + timedelta(minutes=30)

    # Implemented within the past 5 days (closed status not used).
    impl1_sched_start = now - timedelta(days=4, hours=6)
    impl1_sched_end = impl1_sched_start + timedelta(hours=2)
    impl1_actual_start = impl1_sched_start + timedelta(minutes=8)
    impl1_actual_end = impl1_sched_start + timedelta(hours=1)

    impl2_sched_start = now - timedelta(days=2, hours=14)
    impl2_sched_end = impl2_sched_start + timedelta(hours=3)
    impl2_actual_start = impl2_sched_start + timedelta(minutes=12)
    impl2_actual_end = impl2_sched_start + timedelta(hours=1, minutes=30)

    impl3_sched_start = now - timedelta(days=1, hours=3)
    impl3_sched_end = impl3_sched_start + timedelta(hours=2)
    impl3_actual_start = impl3_sched_start + timedelta(minutes=5)
    impl3_actual_end = impl3_sched_start + timedelta(hours=1)

    return [
        (
            SEED_CHANGE_1_ID,
            {
                "summary": "Patch mail relays",
                "description": "Scheduled OS patches on mail relays.",
                "status": "scheduled",
                "risk_score": 80,
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
                "risk_score": 20,
                "scheduled_start": now + timedelta(days=3),
                "scheduled_end": now + timedelta(days=3, hours=1),
                "assigned_user_id": None,
                "requested_by": SEED_READWRITE_ID,
            },
        ),
        (
            SEED_CHANGE_3_ID,
            {
                "summary": "Rotate edge TLS certificates",
                "description": "Live window straddling now for list testing.",
                "status": "in-progress",
                "risk_score": 55,
                "scheduled_start": ip1_start,
                "scheduled_end": ip1_end,
                "actual_start": ip1_start + timedelta(minutes=4),
                "assigned_user_id": SEED_READWRITE_ID,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
        (
            SEED_CHANGE_4_ID,
            {
                "summary": "Apply DB minor version bump",
                "description": "Rolling restart of read replicas mid-window.",
                "status": "in-progress",
                "risk_score": 70,
                "scheduled_start": ip2_start,
                "scheduled_end": ip2_end,
                "actual_start": ip2_start + timedelta(minutes=6),
                "assigned_user_id": SEED_ADMIN_ID,
                "requested_by": SEED_READWRITE_ID,
            },
        ),
        (
            SEED_CHANGE_5_ID,
            {
                "summary": "CDN cache key rewrite",
                "description": "Purge and warm critical paths during the window.",
                "status": "in-progress",
                "risk_score": 40,
                "scheduled_start": ip3_start,
                "scheduled_end": ip3_end,
                "actual_start": ip3_start + timedelta(minutes=3),
                "assigned_user_id": SEED_READWRITE_ID,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
        (
            SEED_CHANGE_6_ID,
            {
                "summary": "Upgrade Wi-Fi controller firmware",
                "description": "Campus controller pair; maintenance window day 2.",
                "status": "scheduled",
                "risk_score": 60,
                "scheduled_start": now + timedelta(days=2, hours=4),
                "scheduled_end": now + timedelta(days=2, hours=6),
                "assigned_user_id": SEED_READWRITE_ID,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
        (
            SEED_CHANGE_7_ID,
            {
                "summary": "Expand object storage pool",
                "description": "Add capacity nodes; no customer downtime expected.",
                "status": "scheduled",
                "risk_score": 35,
                "scheduled_start": now + timedelta(days=3, hours=10),
                "scheduled_end": now + timedelta(days=3, hours=12),
                "assigned_user_id": None,
                "requested_by": SEED_READWRITE_ID,
            },
        ),
        (
            SEED_CHANGE_8_ID,
            {
                "summary": "Retire legacy SMTP relay",
                "description": "Cutover remaining senders to new relay pair.",
                "status": "scheduled",
                "risk_score": 50,
                "scheduled_start": now + timedelta(days=4, hours=16),
                "scheduled_end": now + timedelta(days=4, hours=18),
                "assigned_user_id": SEED_ADMIN_ID,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
        (
            SEED_CHANGE_9_ID,
            {
                "summary": "Patch identity gateway nodes",
                "description": "Completed within window; awaiting formal close.",
                "status": "implemented",
                "risk_score": 65,
                "scheduled_start": impl1_sched_start,
                "scheduled_end": impl1_sched_end,
                "actual_start": impl1_actual_start,
                "actual_end": impl1_actual_end,
                "assigned_user_id": SEED_READWRITE_ID,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
        (
            SEED_CHANGE_10_ID,
            {
                "summary": "Migrate helpdesk queue routing",
                "description": "New categories live; monitoring for misroutes.",
                "status": "implemented",
                "risk_score": 30,
                "scheduled_start": impl2_sched_start,
                "scheduled_end": impl2_sched_end,
                "actual_start": impl2_actual_start,
                "actual_end": impl2_actual_end,
                "assigned_user_id": SEED_ADMIN_ID,
                "requested_by": SEED_READWRITE_ID,
            },
        ),
        (
            SEED_CHANGE_11_ID,
            {
                "summary": "Enable MFA step-up for admin portal",
                "description": "Policy pushed; residual exceptions under review.",
                "status": "implemented",
                "risk_score": 45,
                "scheduled_start": impl3_sched_start,
                "scheduled_end": impl3_sched_end,
                "actual_start": impl3_actual_start,
                "actual_end": impl3_actual_end,
                "assigned_user_id": SEED_READWRITE_ID,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
        (
            SEED_CHANGE_12_ID,
            {
                "summary": "Replace lobby digital signage players",
                "description": "Draft plan; hardware on order.",
                "status": "draft",
                "risk_score": 15,
                "scheduled_start": now + timedelta(days=7),
                "scheduled_end": now + timedelta(days=7, hours=2),
                "assigned_user_id": None,
                "requested_by": SEED_READWRITE_ID,
            },
        ),
        (
            SEED_CHANGE_13_ID,
            {
                "summary": "Introduce canary for API gateway",
                "description": "Drafting rollout checklist and abort criteria.",
                "status": "draft",
                "risk_score": 55,
                "scheduled_start": now + timedelta(days=10, hours=8),
                "scheduled_end": now + timedelta(days=10, hours=10),
                "assigned_user_id": SEED_READWRITE_ID,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
        (
            SEED_CHANGE_14_ID,
            {
                "summary": "Archive unused VPN profiles",
                "description": "Inventory complete; change still in draft.",
                "status": "draft",
                "risk_score": 10,
                "scheduled_start": now + timedelta(days=13),
                "scheduled_end": now + timedelta(days=13, hours=1),
                "assigned_user_id": None,
                "requested_by": SEED_ADMIN_ID,
            },
        ),
    ]
