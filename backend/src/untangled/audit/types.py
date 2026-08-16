"""Stable audit vocabulary."""

from __future__ import annotations

from enum import StrEnum


class ActorChannel(StrEnum):
    HUMAN = "human"
    SYSTEM = "system"
    OPERATOR = "operator"


class Outcome(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"


class Severity(StrEnum):
    INFO = "info"
    NOTICE = "notice"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class EventType(StrEnum):
    """Stable event_type strings. Auth-abuse values reserved for #33."""

    AUTH_LOGIN = "auth.login"
    AUTH_REFRESH = "auth.refresh"
    AUTH_LOGOUT = "auth.logout"
    AUTH_PASSWORD_CHANGE = "auth.password_change"
    # Reserved for #33 (auth hardening) — emit via AuditLogger when that lands.
    AUTH_RATE_LIMIT_TRIP = "auth.rate_limit_trip"
    AUTH_REFRESH_REUSE = "auth.refresh_reuse"
    AUTH_FAILED = "auth.failed"
    AUTH_CSRF_DENIED = "auth.csrf_denied"

    RECORD_SEARCH = "record.search"
    RECORD_FETCH = "record.fetch"
    RECORD_CREATE = "record.create"
    RECORD_UPDATE = "record.update"
    RECORD_DELETE = "record.delete"
    RECORD_AUTHZ_DENIED = "record.authz_denied"
    RECORD_AUTHN_DENIED = "record.authn_denied"

    RBAC_PRIVILEGE_CHANGE = "rbac.privilege_change"
    AUDIT_BULK_READ_VOLUME = "audit.bulk_read_volume"
    AUDIT_COMPENSATE = "audit.compensate"
