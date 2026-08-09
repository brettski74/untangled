"""ASGI middleware: assign correlation_id per request."""

from __future__ import annotations

from uuid import uuid4

from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from untangled.audit.context import reset_correlation_id, set_correlation_id


class AuditCorrelationMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        incoming = request.headers.get("x-correlation-id") or request.headers.get(
            "x-request-id"
        )
        cid = incoming.strip() if incoming else str(uuid4())
        set_correlation_id(cid)
        try:
            response = await call_next(request)
            response.headers["X-Correlation-Id"] = cid
            return response
        finally:
            reset_correlation_id()
