#!/usr/bin/env node
// GitHub Pages DNS/certificate health verifier for Daybreak's production domain.
// This is intentionally separate from verify:launch: it reports GitHub's own
// Pages health state, including asynchronous DNS health checks and HTTPS flags.
import { execFileSync } from "node:child_process";

import {
  evaluatePagesHealth,
  fetchPagesConfig,
  fetchPagesHealth,
  renderPagesHealthReport,
} from "./pages-health-core.mjs";

function readToken() {
  if (process.env.GH_TOKEN) return process.env.GH_TOKEN;
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;

  try {
    return execFileSync("gh", ["auth", "token"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const token = readToken();
const config = await fetchPagesConfig({ token });
const health = await fetchPagesHealth({ token });

if (!config.ok) {
  console.log(
    `PAGES_CONFIG_FETCH=fail status=${config.status} message=${config.body?.message ?? "unknown"}`,
  );
  process.exit(1);
}

if (!health.ok) {
  console.log(
    `PAGES_HEALTH_FETCH=fail status=${health.status} message=${health.body?.message ?? health.error ?? "unknown"}`,
  );
  process.exit(1);
}

const evaluation = evaluatePagesHealth({
  config: config.body,
  health: health.body,
});

console.log(renderPagesHealthReport(evaluation));
process.exit(evaluation.pass ? 0 : 1);
