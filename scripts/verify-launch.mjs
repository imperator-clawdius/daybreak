#!/usr/bin/env node
// Daybreak launch verifier: hits the live site over HTTPS and reports real
// status codes. It checks the production apex by default and can take an
// explicit preview URL override.
//
// Override the target with: node scripts/verify-launch.mjs <url>

import { verifyLaunch } from "./launch-core.mjs";

const report = await verifyLaunch();
console.log(report.text);

// Set the code and let the event loop drain naturally instead of a hard
// process.exit(), which can trip a libuv teardown assertion on Windows.
process.exitCode = report.ok ? 0 : 1;
