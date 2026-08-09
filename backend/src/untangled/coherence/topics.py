"""Stable coherence topic names and minimal payloads."""

from __future__ import annotations

from typing import Any

# Namespaced invalidation signal for the process-local system-config cache.
SYSTEM_CONFIG_INVALIDATE_TOPIC = "untangled.coherence.system_config.invalidate"

# Version marker only — no credentials, secrets, tokens, or PII.
SYSTEM_CONFIG_INVALIDATE_PAYLOAD: dict[str, Any] = {"v": 1}
