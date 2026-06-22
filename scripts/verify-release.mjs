#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateInstallerArtifact,
  expectedInstallerPath,
  readAuthenticodeSignature,
  renderReleaseReport,
} from "./release-core.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const installerPath = expectedInstallerPath(root);
const signature = readAuthenticodeSignature(installerPath);
const result = evaluateInstallerArtifact({ installerPath, signature });

console.log(renderReleaseReport(result));
process.exitCode = result.pass ? 0 : 1;
