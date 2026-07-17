"""FastAPI application entrypoint.

Replace or extend this module in place as domain APIs, auth, and database
layers land in later M1 tickets. Do not introduce a second application entry.
"""

from fastapi import FastAPI

app = FastAPI(
    title="Untangled ITSM",
    description="Backend API scaffold for Milestone 1.",
    version="0.1.0",
)


@app.get("/health")
def health() -> dict[str, str]:
    """Smoke-test endpoint until domain APIs exist."""
    return {"status": "ok"}


@app.get("/")
def root() -> dict[str, str]:
    """Minimal root response for local smoke checks."""
    return {"service": "untangled-backend", "status": "ok"}
