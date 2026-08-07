"""Newline-delimited JSON file sink with size/time rollover and fsync."""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from collections.abc import Callable
from pathlib import Path

from untangled.audit.event import AuditEvent
from untangled.audit.settings import (
    audit_log_dir,
    audit_rollover_bytes,
    audit_rollover_seconds,
)

_LOG = logging.getLogger("untangled.audit")


class AuditWriteError(OSError):
    """Raised when an audit event cannot be durably written."""


class FileAuditLogger:
    """Append JSON events as NDJSON; flush+fsync each emit; rollover by size/age."""

    def __init__(
        self,
        directory: str | Path | None = None,
        *,
        rollover_bytes: int | None = None,
        rollover_seconds: int | None = None,
        clock: Callable[[], float] | None = None,
    ) -> None:
        self._directory = Path(directory if directory is not None else audit_log_dir())
        self._rollover_bytes = (
            rollover_bytes if rollover_bytes is not None else audit_rollover_bytes()
        )
        self._rollover_seconds = (
            rollover_seconds
            if rollover_seconds is not None
            else audit_rollover_seconds()
        )
        self._clock = clock if clock is not None else time.time
        self._lock = threading.Lock()
        self._path: Path | None = None
        self._opened_at: float | None = None
        self._fh = None

    def emit(self, event: AuditEvent) -> None:
        line = json.dumps(event.to_json_dict(), separators=(",", ":"), default=str)
        with self._lock:
            try:
                self._ensure_file()
                assert self._fh is not None and self._path is not None
                self._fh.write(line + "\n")
                self._fh.flush()
                os.fsync(self._fh.fileno())
                self._maybe_rollover()
            except OSError as exc:
                _LOG.error(
                    "audit file sink write failed path=%s err=%s",
                    self._path,
                    exc,
                )
                raise AuditWriteError(str(exc)) from exc

    def close(self) -> None:
        with self._lock:
            self._close_unlocked()

    def _ensure_file(self) -> None:
        self._directory.mkdir(parents=True, exist_ok=True)
        if self._fh is None:
            self._open_new()
            return
        assert self._path is not None and self._opened_at is not None
        size = self._path.stat().st_size if self._path.exists() else 0
        age = self._clock() - self._opened_at
        if size >= self._rollover_bytes or age >= self._rollover_seconds:
            self._close_unlocked()
            self._open_new()

    def _maybe_rollover(self) -> None:
        """Check after write whether the next emit should open a new file."""
        if self._path is None or self._opened_at is None:
            return
        size = self._path.stat().st_size
        age = self._clock() - self._opened_at
        if size >= self._rollover_bytes or age >= self._rollover_seconds:
            self._close_unlocked()

    def _open_new(self) -> None:
        stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(self._clock()))
        # Counter avoids colliding when multiple files open in the same second.
        self._seq = getattr(self, "_seq", 0) + 1
        name = f"audit-{stamp}-{os.getpid()}-{self._seq}.ndjson"
        path = self._directory / name
        self._fh = open(path, "a", encoding="utf-8")
        self._path = path
        self._opened_at = self._clock()

    def _close_unlocked(self) -> None:
        if self._fh is not None:
            try:
                self._fh.close()
            except OSError as exc:
                _LOG.error("audit file sink close failed err=%s", exc)
            self._fh = None
            self._path = None
            self._opened_at = None
