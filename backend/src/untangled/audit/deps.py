"""Process-wide audit logger accessor (app.state + test DI)."""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from untangled.audit.logger import AuditLogger

_logger: AuditLogger | None = None


def set_audit_logger(logger: AuditLogger | None) -> None:
    """Install the active logger (startup or test override)."""
    global _logger
    _logger = logger


def get_audit_logger() -> AuditLogger:
    """Return the active logger; raises if not wired."""
    if _logger is None:
        raise RuntimeError("audit logger is not configured")
    return _logger


def ensure_audit_logger() -> AuditLogger:
    """Return the active logger, wiring the MVP file sink if none is installed.

    Privilege-mutation and CLI seed paths must not apply changes without a
    durable audit attempt. App lifespan still wires eagerly; this covers seed
    CLI and early test fixtures that never imported ``main``.
    """
    if _logger is not None:
        return _logger
    from untangled.audit.file_sink import FileAuditLogger

    logger = FileAuditLogger()
    set_audit_logger(logger)
    return logger
