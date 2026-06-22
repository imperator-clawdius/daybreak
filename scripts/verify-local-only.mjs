#!/usr/bin/env node
// Verifies Daybreak's desktop runtime stays local-only: no telemetry packages
// and no outbound browser/Electron/Node network APIs in runtime source.
import {
  evaluateLocalOnlyPolicy,
  readLocalOnlyInputs,
  renderLocalOnlyReport,
} from "./local-only-core.mjs";

const result = evaluateLocalOnlyPolicy(readLocalOnlyInputs(process.cwd()));
console.log(renderLocalOnlyReport(result));
process.exit(result.pass ? 0 : 1);
