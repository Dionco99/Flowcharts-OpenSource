# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Errors raised by the bar library."""

from __future__ import annotations


class BarsError(ValueError):
    """A tape, timeframe, or trade the library will not accept."""

    def __init__(self, message: str, code: str = "invalid_argument") -> None:
        super().__init__(message)
        self.code = code
