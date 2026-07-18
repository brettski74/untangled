"""Convention-based class definition loading and model generation."""

from untangled.mapping.definition import ClassDefinition, load_definitions
from untangled.mapping.generate import generate_models
from untangled.mapping.naming import (
    kebab_to_pascal,
    kebab_to_snake,
    snake_to_kebab,
    snake_to_pascal,
)

__all__ = [
    "ClassDefinition",
    "generate_models",
    "kebab_to_pascal",
    "kebab_to_snake",
    "load_definitions",
    "snake_to_kebab",
    "snake_to_pascal",
]
