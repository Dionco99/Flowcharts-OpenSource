// SPDX-License-Identifier: Apache-2.0

const license = document.querySelector("#license");
const mode = document.querySelector("#mode");
const health = document.querySelector("#health");

try {
  const buildResponse = await fetch("build.json");
  if (buildResponse.ok) {
    const build = await buildResponse.json();
    if (typeof build.license === "string" && build.license.length > 0) {
      license.textContent = build.license;
    }
  }
} catch {
  license.textContent = "Apache-2.0";
}

try {
  const response = await fetch("healthz");
  if (!response.ok) {
    mode.textContent = "static host";
    health.textContent = "n/a";
    health.dataset.state = "pending";
  } else {
    const body = await response.json();
    mode.textContent = "container";
    const ok = body.status === "ok" && body.service === "flowchart-web";
    health.textContent = ok ? "ok" : "unknown";
    health.dataset.state = ok ? "ok" : "pending";
  }
} catch {
  mode.textContent = "static host";
  health.textContent = "n/a";
  health.dataset.state = "pending";
}
