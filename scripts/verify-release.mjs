#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateReleasePreflight,
  expectedPackagedAppPath,
  expectedInstallerPath,
  readAuthenticodeSignature,
  renderReleaseReport,
  runPackagedSmokeSuite,
} from "./release-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installerPath = expectedInstallerPath(root);
const signature = readAuthenticodeSignature(installerPath);
const packagedSmoke = runPackagedSmokeSuite(expectedPackagedAppPath(root));
const result = evaluateReleasePreflight({
  root,
  installerPath,
  signature,
  packagedSmoke,
});

console.log(renderReleaseReport(result));
process.exitCode = result.pass ? 0 : 1;
