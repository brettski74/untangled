"""Check-constraint naming and expression normalisation for Schema IR."""

from __future__ import annotations


def check_constraint_name(table_name: str, index: int) -> str:
    """Stable check name: ``{table}_check_{n}`` (1-based declaration order)."""
    if index < 1:
        raise ValueError(f"check constraint index must be >= 1, got {index}")
    return f"{table_name}_check_{index}"


def normalize_check_expression(raw: str) -> str:
    """Collapse Postgres/YAML check text for stable IR comparison."""
    text = " ".join(raw.strip().split())
    if text.upper().startswith("CHECK"):
        text = text[5:].strip()
    text = _unwrap_balanced_parens(text)
    return " ".join(text.split())


def _unwrap_balanced_parens(text: str) -> str:
    while text.startswith("(") and text.endswith(")"):
        depth = 0
        wraps_all = True
        for index, char in enumerate(text):
            if char == "(":
                depth += 1
            elif char == ")":
                depth -= 1
                if depth == 0 and index != len(text) - 1:
                    wraps_all = False
                    break
        if not wraps_all or depth != 0:
            break
        text = text[1:-1].strip()
    return text
