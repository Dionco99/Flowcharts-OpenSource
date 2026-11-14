// SPDX-License-Identifier: Apache-2.0

import { cp, mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");

await mkdir(dist, { recursive: true });
await cp(join(here, "public"), dist, { recursive: true });
await writeFile(
  join(dist, "build.json"),
  `${JSON.stringify(
    {
      service: "flowchart-web",
      license: "Apache-2.0",
    },
    null,
    2,
  )}\n`,
);
