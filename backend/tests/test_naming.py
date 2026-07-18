"""Unit tests for naming-convention maps."""

from untangled.mapping.naming import (
    kebab_to_pascal,
    kebab_to_snake,
    snake_to_kebab,
    snake_to_pascal,
)


def test_kebab_to_snake() -> None:
    assert kebab_to_snake("demo-item") == "demo_item"
    assert kebab_to_snake("created-at") == "created_at"
    assert kebab_to_snake("title") == "title"


def test_snake_to_kebab() -> None:
    assert snake_to_kebab("demo_item") == "demo-item"
    assert snake_to_kebab("created_at") == "created-at"


def test_snake_to_pascal() -> None:
    assert snake_to_pascal("demo_item") == "DemoItem"
    assert snake_to_pascal("id") == "Id"


def test_kebab_to_pascal() -> None:
    assert kebab_to_pascal("demo-item") == "DemoItem"
    assert kebab_to_pascal("fixed-amount") == "FixedAmount"


def test_round_trip_kebab_snake() -> None:
    assert snake_to_kebab(kebab_to_snake("display-name")) == "display-name"
    assert kebab_to_snake(snake_to_kebab("display_name")) == "display_name"
