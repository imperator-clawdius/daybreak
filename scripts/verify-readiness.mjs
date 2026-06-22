#!/usr/bin/env node
// Daybreak readiness gate - modeled on TraceReady's sale-readiness discipline.
// It reports the REAL state of each launch-blocking component and refuses to
// call Daybreak sale-ready while any hard proof is still missing. It never
// fabricates a pass: every pass is backed by a file on disk or a checked URL.
//
// Exit 0 only when every gate passes, OR when --allow-pending is given (then it
// prints the honest pending report and exits 0 so it can run inside `check`
// without blocking the build).

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  buildReadinessGates,
  renderReadinessReport,
} from "./readiness-core.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowPending = process.argv.includes("--allow-pending");

const gates = await buildReadinessGates({ root });
const report = renderReadinessReport(gates);

console.log(report.text);

if (report.allPass) process.exit(0);
process.exit(allowPending ? 0 : 1);
