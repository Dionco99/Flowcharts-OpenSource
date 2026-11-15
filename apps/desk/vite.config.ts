// SPDX-License-Identifier: Apache-2.0

import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type ViteDevServer } from "vite";
import { localReport, type HostBody } from "./src/server/host.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function deskHost() {
  return {
    name: "desk-host",
    configureServer(server: ViteDevServer) {
      server.middlewares.use("/api/desk", (req, res) => {
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end();
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => chunks.push(chunk));
        req.on("end", () => {
          void localReport(JSON.parse(Buffer.concat(chunks).toString("utf8")) as HostBody)
            .then((report) => {
              res.setHeader("content-type", "application/json");
              res.end(JSON.stringify(report));
            })
            .catch((error: unknown) => {
              res.statusCode = 500;
              res.end(error instanceof Error ? error.message : "Desk host failed.");
            });
        });
      });
    },
  };
}

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    fs: { allow: [root] },
  },
  plugins: [deskHost()],
});
