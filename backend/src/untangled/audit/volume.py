"""In-process bulk-read volume signal (per-process; signal-quality only)."""

from __future__ import annotations

import threading
import time
from collections import defaultdict
from uuid import UUID

from untangled.audit.emit import emit_best_effort, make_event
from untangled.audit.types import ActorChannel, EventType, Outcome, Severity

_lock = threading.Lock()
# actor_key -> (window_start_epoch, count)
_windows: dict[str, tuple[float, int]] = defaultdict(lambda: (0.0, 0))
_signaled: set[str] = set()


def note_search(
    *,
    user_id: UUID | None,
    window_seconds: int,
    max_searches: int,
    ip_address: str | None,
    class_name: str,
) -> None:
    """Count a successful search; emit volume signal once per window when over max."""
    if window_seconds <= 0 or max_searches <= 0:
        return
    key = str(user_id) if user_id is not None else f"anon:{ip_address or 'unknown'}"
    now = time.time()
    with _lock:
        start, count = _windows[key]
        if start <= 0 or now - start >= window_seconds:
            start = now
            count = 0
            _signaled.discard(key)
        count += 1
        _windows[key] = (start, count)
        should_signal = count > max_searches and key not in _signaled
        if should_signal:
            _signaled.add(key)
    if should_signal:
        emit_best_effort(
            make_event(
                event_type=EventType.AUDIT_BULK_READ_VOLUME,
                actor_channel=ActorChannel.HUMAN,
                outcome=Outcome.SUCCESS,
                reason="bulk_read_threshold_exceeded",
                severity=Severity.WARNING,
                user_id=user_id,
                ip_address=ip_address,
                data={
                    "class": class_name,
                    "window_seconds": window_seconds,
                    "max_searches": max_searches,
                    "count": count,
                },
            )
        )


def reset_bulk_read_state_for_tests() -> None:
    with _lock:
        _windows.clear()
        _signaled.clear()
