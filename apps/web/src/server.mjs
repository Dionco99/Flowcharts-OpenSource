// SPDX-License-Identifier: Apache-2.0

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const defaultRoot = fileURLToPath(new URL("../dist/", import.meta.url));

const TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const SECURITY_HEADERS = {
  "content-security-policy": "default-src 'self'; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'none'",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

export function resolveStaticPath(rootDir, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const relative = decoded.replace(/^\/+/, "");
  const rootResolved = resolve(rootDir);
  const file = resolve(rootResolved, relative);
  if (file !== rootResolved && !file.startsWith(rootResolved + sep)) return null;
  return file;
}

function send(res, status, headers, body) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

export function createWebServer(options = {}) {
  const rootDir = options.root ?? defaultRoot;
  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/healthz") {
      if (req.method !== "GET" && req.method !== "HEAD") {
        send(res, 405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" }, "");
        return;
      }
      const body = `${JSON.stringify({ status: "ok", service: "flowchart-web" })}\n`;
      send(
        res,
        200,
        { "cache-control": "no-store", "content-type": "application/json; charset=utf-8" },
        req.method === "HEAD" ? "" : body,
      );
      return;
    }

    if (req.method !== "GET" && req.method !== "HEAD") {
      send(res, 405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" }, "");
      return;
    }

    const requestPath = url.pathname.endsWith("/") ? `${url.pathname}index.html` : url.pathname;
    const file = resolveStaticPath(rootDir, requestPath);
    if (!file || file === resolve(rootDir)) {
      send(res, 404, { "content-type": "text/plain; charset=utf-8" }, req.method === "HEAD" ? "" : "Not found\n");
      return;
    }

    try {
      const info = await stat(file);
      if (!info.isFile()) {
        send(res, 404, { "content-type": "text/plain; charset=utf-8" }, req.method === "HEAD" ? "" : "Not found\n");
        return;
      }
      const body = await readFile(file);
      const cache = extname(file) === ".html" ? "no-cache" : "public, max-age=3600";
      send(
        res,
        200,
        {
          "cache-control": cache,
          "content-type": TYPES[extname(file)] ?? "application/octet-stream",
        },
        req.method === "HEAD" ? "" : body,
      );
    } catch {
      send(res, 404, { "content-type": "text/plain; charset=utf-8" }, req.method === "HEAD" ? "" : "Not found\n");
    }
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? 8080);
  const host = process.env.HOST ?? "0.0.0.0";
  const server = createWebServer();
  server.listen(port, host, () => {
    console.log(`flowchart-web listening on ${host}:${port}`);
  });
}
