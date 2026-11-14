// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 4731,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4731,
    strictPort: true,
  },
});
