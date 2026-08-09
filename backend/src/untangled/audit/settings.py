"""Environment settings for the file audit sink."""

from __future__ import annotations

import os


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def audit_log_dir() -> str:
    """Directory for NDJSON audit files (Compose mounts a volume here)."""
    return os.environ.get("UNTANGLED_AUDIT_LOG_DIR", "/var/log/untangled/audit")


def audit_rollover_bytes() -> int:
    """Rotate the active file when size exceeds this many bytes (default 1 MiB)."""
    return _int_env("UNTANGLED_AUDIT_ROLLOVER_BYTES", 1_048_576)


def audit_rollover_seconds() -> int:
    """Rotate the active file when age exceeds this many seconds (default 24h)."""
    return _int_env("UNTANGLED_AUDIT_ROLLOVER_SECONDS", 24 * 60 * 60)
