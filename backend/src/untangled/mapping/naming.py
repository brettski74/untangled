"""Mechanical naming-convention maps across YAML / SQL / JSON / Python / JS."""

from __future__ import annotations


def kebab_to_snake(value: str) -> str:
    """Convert kebab-case to snake_case (e.g. ``demo-item`` → ``demo_item``)."""
    if not value:
        return value
    return value.replace("-", "_")


def snake_to_kebab(value: str) -> str:
    """Convert snake_case to kebab-case (e.g. ``demo_item`` → ``demo-item``)."""
    if not value:
        return value
    return value.replace("_", "-")


def snake_to_pascal(value: str) -> str:
    """Convert snake_case to PascalCase (e.g. ``demo_item`` → ``DemoItem``)."""
    if not value:
        return value
    return "".join(part.capitalize() for part in value.split("_") if part)


def kebab_to_pascal(value: str) -> str:
    """Convert kebab-case to PascalCase (e.g. ``demo-item`` → ``DemoItem``)."""
    return snake_to_pascal(kebab_to_snake(value))
