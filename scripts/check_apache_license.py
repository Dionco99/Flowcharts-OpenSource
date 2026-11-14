#!/usr/bin/env python3
# Copyright 2026 Dionco99
# SPDX-License-Identifier: Apache-2.0
"""Fail unless this repository is Apache-2.0.

The root LICENSE file must be the Apache License, Version 2.0 text
published at http://www.apache.org/licenses/LICENSE-2.0.txt
(sha256 cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30).

First-party source under apps/, packages/, and scripts/ must declare
SPDX-License-Identifier: Apache-2.0. Another LICENSE file in the tree
must be that same Apache-2.0 text.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
APACHE_2_0_SHA256 = (
    "cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30"
)
SOURCE_SUFFIXES = {
    ".c",
    ".cc",
    ".cjs",
    ".cpp",
    ".go",
    ".h",
    ".hpp",
    ".java",
    ".js",
    ".jsx",
    ".kt",
    ".mjs",
    ".py",
    ".pyi",
    ".rs",
    ".scala",
    ".ts",
    ".tsx",
}
SOURCE_ROOTS = ("apps", "packages", "scripts")
LICENSE_NAMES = {"COPYING", "COPYING.txt", "LICENSE", "LICENSE.md", "LICENSE.txt"}
SKIP_DIRS = {".git", ".venv", "__pycache__", "coverage", "dist", "node_modules", "venv"}
PACKAGES = (
    "alerts",
    "bars",
    "brokers",
    "chart-tools",
    "edge",
    "journal",
    "multi-instrument",
    "orders",
    "plugins",
    "replay",
    "risk",
    "script",
    "workspace",
)


def main() -> int:
    errors: list[str] = []
    license_path = ROOT / "LICENSE"
    license_bytes = b""
    if not license_path.is_file():
        errors.append("LICENSE is missing")
    else:
        license_bytes = license_path.read_bytes()
        digest = hashlib.sha256(license_bytes).hexdigest()
        if digest != APACHE_2_0_SHA256:
            errors.append(
                "LICENSE is not the Apache License, Version 2.0 "
                f"(sha256 {digest})"
            )
        text = license_bytes.decode("utf-8", errors="replace")
        if "Apache License" not in text or "Version 2.0, January 2004" not in text:
            errors.append("LICENSE is missing the Apache License 2.0 heading")

    notice_path = ROOT / "NOTICE"
    if not notice_path.is_file():
        errors.append("NOTICE is missing")
    else:
        notice = notice_path.read_text(encoding="utf-8")
        if not notice.strip():
            errors.append("NOTICE is empty")
        elif "Flowchart" not in notice or "Apache" not in notice:
            errors.append("NOTICE must name Flowchart and the Apache License")

    if not (ROOT / "docs" / "dependencies.md").is_file():
        errors.append("docs/dependencies.md is missing")
    if not (ROOT / "apps" / "desk" / "README.md").is_file():
        errors.append("apps/desk/README.md is missing")
    for name in PACKAGES:
        if not (ROOT / "packages" / name / "README.md").is_file():
            errors.append(f"packages/{name}/README.md is missing")

    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT)
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if path.name in LICENSE_NAMES and path.resolve() != license_path.resolve():
            if path.read_bytes() != license_bytes:
                errors.append(f"{rel.as_posix()} is a license file and is not Apache-2.0")
        if path.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        if not rel.parts or rel.parts[0] not in SOURCE_ROOTS:
            continue
        check_source(path, rel, errors)

    if errors:
        print("Apache-2.0 license check failed:", file=sys.stderr)
        for err in errors:
            print(f"- {err}", file=sys.stderr)
        return 1
    print("Apache-2.0 license check passed")
    return 0


def check_source(path: Path, rel: Path, errors: list[str]) -> None:
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[:40]
    found: list[str] = []
    marker = "SPDX-License-Identifier:"
    for line in lines:
        if marker not in line:
            continue
        ident = line.split(marker, 1)[1].strip()
        ident = ident.split("*/", 1)[0].strip()
        ident = ident.split()[0] if ident else ""
        ident = ident.rstrip(".,;:")
        found.append(ident)
    if not found:
        errors.append(f"{rel.as_posix()} is missing SPDX-License-Identifier: Apache-2.0")
        return
    for ident in found:
        if ident != "Apache-2.0":
            errors.append(f"{rel.as_posix()} declares SPDX-License-Identifier: {ident}")


if __name__ == "__main__":
    sys.exit(main())
