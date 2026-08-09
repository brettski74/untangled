"""Redis URL helpers (credential redaction for logs)."""

from __future__ import annotations

from urllib.parse import urlsplit, urlunsplit


def redact_redis_url(url: str) -> str:
    """Return ``url`` with userinfo (password) removed for safe logging.

    Examples:
    - ``redis://:secret@host:6379/0`` → ``redis://host:6379/0``
    - ``redis://user:secret@host:6379/0`` → ``redis://user@host:6379/0``
    - URLs without userinfo are returned unchanged (path/query preserved).
    """
    parts = urlsplit(url)
    if parts.password is None and "@" not in (parts.netloc or ""):
        return url
    hostname = parts.hostname or ""
    if parts.port is not None:
        host = f"{hostname}:{parts.port}"
    else:
        host = hostname
    if parts.username:
        netloc = f"{parts.username}@{host}"
    else:
        netloc = host
    return urlunsplit((parts.scheme, netloc, parts.path, parts.query, parts.fragment))
