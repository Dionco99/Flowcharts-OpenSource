# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Decimal strings for prices and sizes.

A JSON number is rejected. A tick of 0.00001 has to stay exact.
"""

from __future__ import annotations

import re
from decimal import Decimal

from flowchart_multi.errors import MultiInstrumentError

# No exponent, no leading plus, no padded integer part.
_UNSIGNED = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?$")
_SIGNED = re.compile(r"^[+-]?(?:0|[1-9]\d*)(?:\.\d+)?$")


def parse_decimal(value: object, *, field: str, signed: bool = False) -> Decimal:
    """Parse a decimal string. Floats and ints are rejected."""
    if isinstance(value, bool) or not isinstance(value, str):
        raise MultiInstrumentError(f"{field} must be a decimal string")
    pattern = _SIGNED if signed else _UNSIGNED
    if pattern.fullmatch(value) is None:
        raise MultiInstrumentError(f"{field} must be a decimal string")
    return Decimal(value)


def format_decimal(value: Decimal) -> str:
    """Render a decimal the way a tape stores it."""
    return format(value, "f")
