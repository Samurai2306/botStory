"""Detect loop constructs (нц ... кц) in Kumir source using the same preprocessing as the executor."""
from __future__ import annotations

from typing import List


def preprocess_kumir_lines(code: str) -> List[str]:
    lines: List[str] = []
    for line in code.split("\n"):
        if "|" in line:
            line = line[: line.index("|")]
        line = line.strip()
        if line:
            lines.append(line.lower())
    return lines


def kumir_code_contains_loop(code: str) -> bool:
    """True if the program contains at least one line starting with 'нц' (counted loop header)."""
    return any(line.startswith("нц") for line in preprocess_kumir_lines(code))
