// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createWebServer, resolveStaticPath } from "../src/server.mjs";

const execFileAsync = promisify(execFile);
const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("build writes the static shell and the default server serves it", async () => {
  await execFileAsync(process.execPath, ["build.mjs"], { cwd: appRoot });
  const html = await readFile(join(appRoot, "dist", "index.html"), "utf8");
  const build = JSON.parse(await readFile(join(appRoot, "dist", "build.json"), "utf8"));
  assert.match(html, /Self-hosted shell/);
  assert.equal(build.service, "flowchart-web");
  assert.equal(build.license, "Apache-2.0");

  const server = createWebServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Self-hosted shell/);
    const script = await fetch(`http://127.0.0.1:${port}/app.js`);
    assert.equal(script.status, 200);
    const health = await fetch(`http://127.0.0.1:${port}/healthz`);
    assert.deepEqual(await health.json(), { status: "ok", service: "flowchart-web" });
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("resolveStaticPath stays inside the root", () => {
  const root = join(tmpdir(), "flowchart-web-root");
  assert.equal(resolveStaticPath(root, "/index.html"), resolve(root, "index.html"));
  assert.equal(resolveStaticPath(root, "/../secret.txt"), null);
  assert.equal(resolveStaticPath(root, "/%2e%2e/secret.txt"), null);
  assert.equal(resolveStaticPath(root, "/%00index.html"), null);
});

test("server serves the shell and refuses to leave it", async () => {
  const root = join(tmpdir(), `flowchart-web-${process.pid}`);
  const outside = join(tmpdir(), `flowchart-web-secret-${process.pid}.txt`);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "index.html"), "<!DOCTYPE html><title>Flowchart</title><h1>Self-hosted shell</h1>\n");
  await writeFile(outside, "secret-token\n");

  const server = createWebServer({ root });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  try {
    const health = await fetch(`${base}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { status: "ok", service: "flowchart-web" });

    const page = await fetch(`${base}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Self-hosted shell/);
    assert.match(page.headers.get("content-security-policy") ?? "", /default-src 'self'/);

    const head = await fetch(`${base}/healthz`, { method: "HEAD" });
    assert.equal(head.status, 200);

    const missing = await fetch(`${base}/missing`);
    assert.equal(missing.status, 404);

    const escaped = await fetch(`${base}/..%2Fflowchart-web-secret-${process.pid}.txt`);
    assert.notEqual(escaped.status, 200);
    assert.equal((await escaped.text()).includes("secret-token"), false);

    const posted = await fetch(`${base}/healthz`, { method: "POST" });
    assert.equal(posted.status, 405);
  } finally {
    server.close();
    await once(server, "close");
  }
});
