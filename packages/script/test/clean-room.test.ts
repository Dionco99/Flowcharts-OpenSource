// Copyright 2026 Dionco99
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict"
import { readdirSync, readFileSync, statSync } from "node:fs"
import path from "node:path"
import test from "node:test"

const vendor = "trading" + "view"
const dialect = "pi" + "ne"
const banned = [
  new RegExp(vendor, "i"),
  new RegExp(dialect + "\\s*script", "i"),
  new RegExp("\\b" + dialect + "script\\b", "i"),
  new RegExp("\\b" + dialect + "\\b", "i"),
]

test("sources do not brand a vendor script language", () => {
  const root = new URL("..", import.meta.url)
  const files = [
    ...walk(fileUrl(root, "src")),
    ...walk(fileUrl(root, "test")),
    ...walk(fileUrl(root, "examples")),
    fileUrl(root, "docs/flowchart-script.md"),
    fileUrl(root, "package.json"),
    fileUrl(root, "LICENSE"),
  ]
  const hits: string[] = []
  for (const file of files) {
    const text = readFileSync(file, "utf8")
    for (const pattern of banned) {
      if (pattern.test(text)) hits.push(`${file} matches ${pattern}`)
    }
  }
  assert.deepEqual(hits, [])
})

function walk(dir: string): string[] {
  const found: string[] = []
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name)
    if (statSync(full).isDirectory()) found.push(...walk(full))
    else found.push(full)
  }
  return found
}

function fileUrl(root: URL, relative: string): string {
  return new URL(relative, root).pathname
}
