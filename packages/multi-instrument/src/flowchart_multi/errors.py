# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Errors raised by the multi-instrument library."""

from __future__ import annotations


class MultiInstrumentError(ValueError):
    """A spec, tape, or clock value this library will not accept."""
