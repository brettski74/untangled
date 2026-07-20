"""Load and validate YAML class definitions."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import yaml

from untangled.mapping.naming import kebab_to_snake
from untangled.mapping.system_fields import SYSTEM_FIELD_NAMES
from untangled.mapping.types import (
    DEFAULT_FRIENDLY_ID_PAD_WIDTH,
    MIN_FRIENDLY_ID_PAD_WIDTH,
    SUPPORTED_TYPES,
)


class DefinitionError(ValueError):
    """Raised when a class definition file is invalid."""


@dataclass(frozen=True, slots=True)
class AttributeDefinition:
    """One user-declared attribute on a class."""

    name_kebab: str
    name_snake: str
    type_name: str
    required: bool
    # Kebab-case class name this attribute references (FK to that table's ``id``).
    references: str | None = None
    unique: bool = False
    # friendly-id only:
    prefix: str | None = None
    pad_width: int = DEFAULT_FRIENDLY_ID_PAD_WIDTH
    start_at: int | None = None


@dataclass(frozen=True, slots=True)
class ClassDefinition:
    """Normalized class definition loaded from YAML."""

    name_kebab: str
    name_snake: str
    display_name: str
    description: str
    attributes: tuple[AttributeDefinition, ...]
    source_path: Path

    def friendly_id_attr(self) -> AttributeDefinition | None:
        """Return the sole friendly-id attribute, if any."""
        for attr in self.attributes:
            if attr.type_name == "friendly-id":
                return attr
        return None


def load_definitions(definitions_dir: Path) -> list[ClassDefinition]:
    """Load every ``*.yaml`` / ``*.yml`` class definition from a directory.

    The directory path is an input so the same pipeline can later run against
    custom-class definition trees, not only committed core fixtures.
    """
    if not definitions_dir.is_dir():
        raise DefinitionError(f"definitions directory does not exist: {definitions_dir}")

    paths = sorted(
        (
            *definitions_dir.glob("*.yaml"),
            *definitions_dir.glob("*.yml"),
        ),
        key=lambda p: p.name,
    )
    if not paths:
        raise DefinitionError(f"no YAML class definitions found in {definitions_dir}")

    definitions = [load_definition(path) for path in paths]
    _validate_references(definitions)
    _validate_friendly_id_prefixes(definitions)
    return definitions


def load_definition(path: Path) -> ClassDefinition:
    """Load and validate a single class definition YAML file."""
    try:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        raise DefinitionError(f"{path}: invalid YAML: {exc}") from exc

    if not isinstance(raw, dict):
        raise DefinitionError(f"{path}: root must be a mapping")

    name = raw.get("name")
    if not isinstance(name, str) or not name.strip():
        raise DefinitionError(f"{path}: 'name' is required (kebab-case class name)")
    name = name.strip()
    _require_kebab(name, path, "name")

    display_name = raw.get("display-name")
    if not isinstance(display_name, str) or not display_name.strip():
        raise DefinitionError(f"{path}: 'display-name' is required")
    display_name = display_name.strip()

    description = raw.get("description")
    if not isinstance(description, str) or not description.strip():
        raise DefinitionError(f"{path}: 'description' is required")
    description = description.strip()

    attributes_raw = raw.get("attributes", {})
    if attributes_raw is None:
        attributes_raw = {}
    if not isinstance(attributes_raw, dict):
        raise DefinitionError(f"{path}: 'attributes' must be a mapping")

    attributes: list[AttributeDefinition] = []
    seen_snake: set[str] = set()
    friendly_id_count = 0
    for attr_kebab, spec in attributes_raw.items():
        if not isinstance(attr_kebab, str):
            raise DefinitionError(f"{path}: attribute keys must be strings")
        _require_kebab(attr_kebab, path, f"attribute '{attr_kebab}'")
        snake = kebab_to_snake(attr_kebab)
        if snake in SYSTEM_FIELD_NAMES:
            raise DefinitionError(
                f"{path}: attribute '{attr_kebab}' conflicts with injected system "
                f"field '{snake}'; remove it from the YAML definition"
            )
        if snake in seen_snake:
            raise DefinitionError(f"{path}: duplicate attribute '{attr_kebab}'")
        seen_snake.add(snake)

        if not isinstance(spec, dict):
            raise DefinitionError(f"{path}: attribute '{attr_kebab}' must be a mapping")

        type_name = spec.get("type")
        if not isinstance(type_name, str) or type_name not in SUPPORTED_TYPES:
            raise DefinitionError(
                f"{path}: attribute '{attr_kebab}' has unsupported type "
                f"{type_name!r}; expected one of {sorted(SUPPORTED_TYPES)}"
            )

        required = spec.get("required", False)
        if not isinstance(required, bool):
            raise DefinitionError(f"{path}: attribute '{attr_kebab}'.required must be a boolean")

        references_raw = spec.get("references")
        references: str | None = None
        if references_raw is not None:
            if not isinstance(references_raw, str) or not references_raw.strip():
                raise DefinitionError(
                    f"{path}: attribute '{attr_kebab}'.references must be a non-empty string"
                )
            references = references_raw.strip()
            _require_kebab(references, path, f"attribute '{attr_kebab}'.references")
            if type_name != "uuid":
                raise DefinitionError(
                    f"{path}: attribute '{attr_kebab}' with references must have type uuid"
                )

        unique = spec.get("unique", False)
        if not isinstance(unique, bool):
            raise DefinitionError(f"{path}: attribute '{attr_kebab}'.unique must be a boolean")

        prefix: str | None = None
        pad_width = DEFAULT_FRIENDLY_ID_PAD_WIDTH
        start_at: int | None = None

        if type_name == "friendly-id":
            friendly_id_count += 1
            if friendly_id_count > 1:
                raise DefinitionError(
                    f"{path}: at most one friendly-id attribute is allowed per class"
                )
            if references is not None:
                raise DefinitionError(
                    f"{path}: attribute '{attr_kebab}' friendly-id cannot have references"
                )
            prefix_raw = spec.get("prefix")
            if not isinstance(prefix_raw, str) or not prefix_raw.strip():
                raise DefinitionError(
                    f"{path}: attribute '{attr_kebab}'.prefix is required for friendly-id"
                )
            prefix = prefix_raw.strip()
            if not prefix.isalnum():
                raise DefinitionError(
                    f"{path}: attribute '{attr_kebab}'.prefix must be alphanumeric, "
                    f"got {prefix!r}"
                )

            if "pad-width" in spec:
                pad_raw = spec.get("pad-width")
                if not isinstance(pad_raw, int) or isinstance(pad_raw, bool):
                    raise DefinitionError(
                        f"{path}: attribute '{attr_kebab}'.pad-width must be an integer"
                    )
                if pad_raw < MIN_FRIENDLY_ID_PAD_WIDTH:
                    raise DefinitionError(
                        f"{path}: attribute '{attr_kebab}'.pad-width must be >= "
                        f"{MIN_FRIENDLY_ID_PAD_WIDTH}, got {pad_raw}"
                    )
                pad_width = pad_raw

            if "start-at" in spec:
                start_raw = spec.get("start-at")
                if not isinstance(start_raw, int) or isinstance(start_raw, bool):
                    raise DefinitionError(
                        f"{path}: attribute '{attr_kebab}'.start-at must be an integer"
                    )
                if start_raw < 1:
                    raise DefinitionError(
                        f"{path}: attribute '{attr_kebab}'.start-at must be >= 1, "
                        f"got {start_raw}"
                    )
                start_at = start_raw

            # Unique index is required for friendly-id lookup.
            unique = True
            allowed = {"type", "required", "prefix", "pad-width", "start-at", "unique"}
        else:
            if "prefix" in spec or "pad-width" in spec or "start-at" in spec:
                raise DefinitionError(
                    f"{path}: attribute '{attr_kebab}' has friendly-id-only keys "
                    f"(prefix/pad-width/start-at) but type is {type_name!r}"
                )
            allowed = {"type", "required", "references", "unique"}

        unknown = set(spec) - allowed
        if unknown:
            raise DefinitionError(
                f"{path}: attribute '{attr_kebab}' has unknown keys: {sorted(unknown)}"
            )

        attributes.append(
            AttributeDefinition(
                name_kebab=attr_kebab,
                name_snake=snake,
                type_name=type_name,
                required=required,
                references=references,
                unique=unique,
                prefix=prefix,
                pad_width=pad_width,
                start_at=start_at,
            )
        )

    unknown_top = set(raw) - {"name", "display-name", "description", "attributes"}
    if unknown_top:
        raise DefinitionError(f"{path}: unknown top-level keys: {sorted(unknown_top)}")

    return ClassDefinition(
        name_kebab=name,
        name_snake=kebab_to_snake(name),
        display_name=display_name,
        description=description,
        attributes=tuple(attributes),
        source_path=path,
    )


def _validate_references(definitions: list[ClassDefinition]) -> None:
    known = {defn.name_kebab for defn in definitions}
    for defn in definitions:
        for attr in defn.attributes:
            if attr.references is None:
                continue
            if attr.references not in known:
                raise DefinitionError(
                    f"{defn.source_path}: attribute '{attr.name_kebab}' references "
                    f"unknown class {attr.references!r}"
                )


def _validate_friendly_id_prefixes(definitions: list[ClassDefinition]) -> None:
    """Reject duplicate prefixes case-insensitively across the definitions tree."""
    seen: dict[str, tuple[Path, str]] = {}
    for defn in definitions:
        for attr in defn.attributes:
            if attr.type_name != "friendly-id" or attr.prefix is None:
                continue
            key = attr.prefix.lower()
            if key in seen:
                other_path, other_prefix = seen[key]
                raise DefinitionError(
                    f"{defn.source_path}: friendly-id prefix {attr.prefix!r} collides "
                    f"with {other_prefix!r} in {other_path} (prefixes are "
                    f"case-insensitive)"
                )
            seen[key] = (defn.source_path, attr.prefix)


def _require_kebab(value: str, path: Path, label: str) -> None:
    if value != value.lower() or "_" in value or value.startswith("-") or value.endswith("-"):
        raise DefinitionError(f"{path}: {label} must be kebab-case, got {value!r}")
    if "--" in value:
        raise DefinitionError(f"{path}: {label} must be kebab-case, got {value!r}")
    # Allow single-segment names (e.g. ``title``) and multi-segment kebab.
    for part in value.split("-"):
        if not part or not part.isalnum():
            raise DefinitionError(f"{path}: {label} must be kebab-case, got {value!r}")
