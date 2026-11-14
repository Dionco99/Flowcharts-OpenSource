# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Decimal strings. A float is rejected so a tick of 0.00001 stays exact."""

from __future__ import annotations

import re
from decimal import Decimal

from flowchart_bars.errors import BarsError

_DECIMAL = re.compile(r"^(?:0|[1-9]\d*)(?:\.\d+)?$")
_WHOLE = re.compile(r"^(?:0|[1-9]\d*)$")


def require_decimal(value: object, label: str) -> str:
    if isinstance(value, bool) or not isinstance(value, str) or not _DECIMAL.fullmatch(value):
        raise BarsError(f"{label} must be a decimal string", code="invalid_bar")
    return value


def require_whole(value: object, label: str) -> str:
    if isinstance(value, bool) or not isinstance(value, str) or not _WHOLE.fullmatch(value):
        raise BarsError(f"{label} must be a whole-number string", code="invalid_bar")
    return value


def require_positive(value: object, label: str) -> str:
    text = require_decimal(value, label)
    if Decimal(text) <= 0:
        raise BarsError(f"{label} must be greater than zero", code="invalid_bar")
    return text


def decimal_text(value: Decimal) -> str:
    text = format(value, "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return text or "0"


def max_text(left: str, right: str) -> str:
    return left if Decimal(left) >= Decimal(right) else right


def min_text(left: str, right: str) -> str:
    return left if Decimal(left) <= Decimal(right) else right


def add_text(left: str, right: str) -> str:
    return decimal_text(Decimal(left) + Decimal(right))
