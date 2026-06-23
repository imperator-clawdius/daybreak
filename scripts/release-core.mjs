import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { extractAll as extractAsar } from "@electron/asar";

export const EXPECTED_SIGNER_SUBJECT = "Passive Print Labs LLC";
export const EXPECTED_PACKAGED_DEPENDENCIES = ["@daybreak/core"];
export const EXPECTED_COPYRIGHT =
  "Copyright (c) 2026 Passive Print Labs LLC";
export const EXPECTED_ARTIFACT_NAME = "${productName} Setup ${version}.${ext}";

export function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

function readOptionalJson(root, relativePath) {
  try {
    return readJson(root, relativePath);
  } catch {
    return null;
  }
}

export function expectedInstallerPath(root) {
  const desktopPackage = readJson(root, "desktop/package.json");
  const productName = desktopPackage.build?.productName || "Daybreak";
  const version = desktopPackage.version;
  return join(root, "desktop", "release", `${productName} Setup ${version}.exe`);
}

export function expectedPackagedAppPath(
  root,
  packagePath = "desktop/package.json",
) {
  const fullPackagePath = join(root, packagePath);
  const desktopPackage = readJson(root, packagePath);
  const productName = desktopPackage.build?.productName || "Daybreak";
  return join(
    dirname(fullPackagePath),
    "release",
    "win-unpacked",
    `${productName}.exe`,
  );
}

export function expectedPackagedAppAsarPath(
  root,
  packagePath = "desktop/package.json",
) {
  return join(
    dirname(expectedPackagedAppPath(root, packagePath)),
    "resources",
    "app.asar",
  );
}

export const RELEASE_SOURCE_PATHS = [
  "package.json",
  "package-lock.json",
  "desktop/assets/icon.ico",
  "desktop/assets/icon.png",
  "desktop/assets/installer-license.txt",
  "desktop/package.json",
  "desktop/tsconfig.json",
  "desktop/build.mjs",
  "desktop/src/main/main.ts",
  "desktop/src/main/preload.ts",
  "desktop/src/main/store.ts",
  "desktop/src/renderer/index.html",
  "desktop/src/renderer/renderer.css",
  "desktop/src/renderer/renderer.ts",
  "packages/core/package.json",
  "packages/core/tsconfig.json",
  "packages/core/src/commit.ts",
  "packages/core/src/dates.ts",
  "packages/core/src/desktop-shell.ts",
  "packages/core/src/external-links.ts",
  "packages/core/src/index.ts",
  "packages/core/src/log-update.ts",
  "packages/core/src/market-signal.ts",
  "packages/core/src/model.ts",
  "packages/core/src/persisted-log.ts",
  "packages/core/src/session.ts",
  "packages/core/src/startup.ts",
  "packages/core/src/streak.ts",
  "packages/core/src/swipe-gesture.ts",
  "packages/core/src/wipe.ts",
  "scripts/slim-packaged-manifests.mjs",
];

const RELEASE_SOURCE_DIRS = [
  "desktop/assets",
  "desktop/src",
  "packages/core/src",
];

const RELEASE_SOURCE_FILES = [
  "package.json",
  "package-lock.json",
  "desktop/build.mjs",
  "desktop/package.json",
  "desktop/tsconfig.json",
  "packages/core/package.json",
  "packages/core/tsconfig.json",
  "scripts/slim-packaged-manifests.mjs",
];

function slashPath(path) {
  return path.replace(/\\/g, "/");
}

function listFiles(root, relativeDir) {
  const fullDir = join(root, relativeDir);
  if (!existsSync(fullDir)) return [];

  return readdirSync(fullDir, { withFileTypes: true }).flatMap((entry) => {
    const relativePath = slashPath(join(relativeDir, entry.name));
    if (entry.isDirectory()) return listFiles(root, relativePath);
    if (entry.isFile()) return [relativePath];
    return [];
  });
}

export function collectReleaseSourcePaths({ root }) {
  return [
    ...RELEASE_SOURCE_FILES.filter((path) => existsSync(join(root, path))),
    ...RELEASE_SOURCE_DIRS.flatMap((dir) => listFiles(root, dir)),
  ].sort();
}

export function evaluateSourceMapExclusion({ distPath }) {
  const sourceMapPaths = listFiles(dirname(distPath), basename(distPath))
    .map((path) => join(dirname(distPath), path))
    .filter((path) => path.endsWith(".map"));

  return {
    pass: sourceMapPaths.length === 0,
    reason:
      sourceMapPaths.length === 0
        ? "source_maps_absent"
        : "source_maps_present",
    sourceMapPaths,
    detail:
      sourceMapPaths.length === 0
        ? "desktop dist contains no source maps"
        : `desktop dist contains source maps: ${sourceMapPaths.join(", ")}`,
  };
}

export function buildAsarListCommand({
  root = process.cwd(),
  packagedAppAsarPath,
}) {
  return {
    executablePath: process.execPath,
    args: [
      join(root, "node_modules", "@electron", "asar", "bin", "asar.js"),
      "list",
      packagedAppAsarPath,
    ],
  };
}

export function readAsarFileList(packagedAppAsarPath) {
  const command = buildAsarListCommand({ packagedAppAsarPath });
  const raw = execFileSync(command.executablePath, command.args, {
    encoding: "utf8",
  });
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function readAsarTextFile(packagedAppAsarPath, filePath) {
  const tempDir = mkdtempSync(join(tmpdir(), "daybreak-asar-read-"));
  try {
    extractAsar(packagedAppAsarPath, tempDir);
    const relativePath = slashPath(filePath).replace(/^\/+/, "");
    return readFileSync(join(tempDir, relativePath), "utf8");
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

export function evaluatePackagedSourceMapExclusion({
  packagedAppAsarPath,
  listAsarFiles = readAsarFileList,
}) {
  if (!existsSync(packagedAppAsarPath)) {
    return {
      pass: false,
      reason: "packaged_app_asar_missing",
      packagedAppAsarPath,
      sourceMapPaths: [],
      detail: `missing ${packagedAppAsarPath}`,
    };
  }

  try {
    const sourceMapPaths = listAsarFiles(packagedAppAsarPath).filter((path) =>
      path.endsWith(".map"),
    );

    return {
      pass: sourceMapPaths.length === 0,
      reason:
        sourceMapPaths.length === 0
          ? "packaged_source_maps_absent"
          : "packaged_source_maps_present",
      packagedAppAsarPath,
      sourceMapPaths,
      detail:
        sourceMapPaths.length === 0
          ? "packaged app.asar contains no source maps"
          : `packaged app.asar contains source maps: ${sourceMapPaths.join(", ")}`,
    };
  } catch (e) {
    return {
      pass: false,
      reason: "packaged_app_asar_unreadable",
      packagedAppAsarPath,
      sourceMapPaths: [],
      detail: String(e.message || e),
    };
  }
}

export function evaluatePackagedSourceExclusion({
  packagedAppAsarPath,
  listAsarFiles = readAsarFileList,
}) {
  if (!existsSync(packagedAppAsarPath)) {
    return {
      pass: false,
      reason: "packaged_app_asar_missing",
      packagedAppAsarPath,
      sourcePaths: [],
      detail: `missing ${packagedAppAsarPath}`,
    };
  }

  try {
    const sourcePaths = listAsarFiles(packagedAppAsarPath).filter((path) => {
      const normalized = slashPath(path);
      return (
        normalized.endsWith(".ts") ||
        normalized.endsWith("/tsconfig.json")
      );
    });

    return {
      pass: sourcePaths.length === 0,
      reason:
        sourcePaths.length === 0
          ? "packaged_source_absent"
          : "packaged_source_present",
      packagedAppAsarPath,
      sourcePaths,
      detail:
        sourcePaths.length === 0
          ? "packaged app.asar contains no TypeScript source files"
          : `packaged app.asar contains TypeScript source files: ${sourcePaths.join(", ")}`,
    };
  } catch (e) {
    return {
      pass: false,
      reason: "packaged_app_asar_unreadable",
      packagedAppAsarPath,
      sourcePaths: [],
      detail: String(e.message || e),
    };
  }
}

function dependencyNameFromAsarPath(path) {
  const parts = slashPath(path).split("/").filter(Boolean);
  const nodeModulesIndex = parts.indexOf("node_modules");
  if (nodeModulesIndex < 0 || nodeModulesIndex + 1 >= parts.length) return "";

  const first = parts[nodeModulesIndex + 1];
  if (first.startsWith("@")) {
    const second = parts[nodeModulesIndex + 2];
    return second ? `${first}/${second}` : "";
  }
  return first;
}

export function evaluatePackagedDependencyAllowlist({
  packagedAppAsarPath,
  listAsarFiles = readAsarFileList,
  allowedDependencies = EXPECTED_PACKAGED_DEPENDENCIES,
}) {
  if (!existsSync(packagedAppAsarPath)) {
    return {
      pass: false,
      reason: "packaged_app_asar_missing",
      packagedAppAsarPath,
      dependencies: [],
      unexpectedDependencies: [],
      detail: `missing ${packagedAppAsarPath}`,
    };
  }

  try {
    const dependencies = [
      ...new Set(
        listAsarFiles(packagedAppAsarPath)
          .map(dependencyNameFromAsarPath)
          .filter(Boolean),
      ),
    ].sort();
    const unexpectedDependencies = dependencies
      .filter((dependency) => !allowedDependencies.includes(dependency))
      .sort();

    return {
      pass: unexpectedDependencies.length === 0,
      reason:
        unexpectedDependencies.length === 0
          ? "packaged_dependencies_allowed"
          : "packaged_dependencies_unexpected",
      packagedAppAsarPath,
      dependencies,
      unexpectedDependencies,
      detail:
        unexpectedDependencies.length === 0
          ? `packaged dependencies allowed: ${dependencies.join(", ") || "none"}`
          : `unexpected packaged dependencies: ${unexpectedDependencies.join(", ")}`,
    };
  } catch (e) {
    return {
      pass: false,
      reason: "packaged_app_asar_unreadable",
      packagedAppAsarPath,
      dependencies: [],
      unexpectedDependencies: [],
      detail: String(e.message || e),
    };
  }
}

export function evaluatePackagedManifestMetadata({
  packagedAppAsarPath,
  listAsarFiles = readAsarFileList,
  readAsarText = readAsarTextFile,
}) {
  if (!existsSync(packagedAppAsarPath)) {
    return {
      pass: false,
      reason: "packaged_app_asar_missing",
      packagedAppAsarPath,
      manifestIssues: [],
      detail: `missing ${packagedAppAsarPath}`,
    };
  }

  try {
    const manifestPaths = listAsarFiles(packagedAppAsarPath)
      .map(slashPath)
      .filter((path) => path.endsWith("/package.json"))
      .sort();
    const forbiddenKeys = ["build", "devDependencies", "scripts"];
    const manifestIssues = manifestPaths.flatMap((manifestPath) => {
      const manifest = JSON.parse(readAsarText(packagedAppAsarPath, manifestPath));
      return forbiddenKeys
        .filter((key) => manifest[key] !== undefined)
        .map((key) => `${manifestPath}:${key}`);
    });

    return {
      pass: manifestIssues.length === 0,
      reason:
        manifestIssues.length === 0
          ? "packaged_manifest_metadata_absent"
          : "packaged_manifest_metadata_present",
      packagedAppAsarPath,
      manifestIssues,
      detail:
        manifestIssues.length === 0
          ? "packaged manifests contain no scripts, devDependencies, or build metadata"
          : `packaged manifests expose development metadata: ${manifestIssues.join(", ")}`,
    };
  } catch (e) {
    return {
      pass: false,
      reason: "packaged_app_asar_unreadable",
      packagedAppAsarPath,
      manifestIssues: [],
      detail: String(e.message || e),
    };
  }
}

export function evaluateReleaseSidecarExclusion({ releaseDir }) {
  const sidecarPaths = listFiles(dirname(releaseDir), basename(releaseDir))
    .filter(
      (path) =>
        path.endsWith("builder-debug.yml") ||
        path.endsWith("builder-debug.yaml") ||
        path.endsWith(".blockmap"),
    )
    .map((path) => join(dirname(releaseDir), path))
    .sort();

  return {
    pass: sidecarPaths.length === 0,
    reason:
      sidecarPaths.length === 0
        ? "release_sidecars_absent"
        : "release_sidecars_present",
    sidecarPaths,
    detail:
      sidecarPaths.length === 0
        ? "release directory contains no debug or update sidecars"
        : `release directory contains debug/update sidecars: ${sidecarPaths.join(", ")}`,
  };
}

export function cleanReleaseSidecars({ releaseDir }) {
  const result = evaluateReleaseSidecarExclusion({ releaseDir });
  for (const sidecarPath of result.sidecarPaths) {
    rmSync(sidecarPath, { force: true });
  }

  return {
    removedPaths: result.sidecarPaths,
  };
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function mtimeMs(path) {
  return statSync(path).mtimeMs;
}

function psString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildAuthenticodeCommand(installerPath) {
  return [
    `$sig = Get-AuthenticodeSignature -LiteralPath ${psString(installerPath)}`,
    "$subject = if ($sig.SignerCertificate) { [string]$sig.SignerCertificate.Subject } else { '' }",
    "$timestamped = $null -ne $sig.TimeStamperCertificate",
    "[pscustomobject]@{",
    "Status = [string]$sig.Status;",
    "StatusMessage = [string]$sig.StatusMessage;",
    "Subject = $subject;",
    "Timestamped = [bool]$timestamped",
    "} | ConvertTo-Json -Compress",
  ].join("\n");
}

export function readAuthenticodeSignature(installerPath) {
  if (process.platform !== "win32") {
    return {
      status: "Unknown",
      statusMessage: "Authenticode signature check is only available on Windows.",
      subject: "",
      timestamped: false,
    };
  }

  try {
    const raw = execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        buildAuthenticodeCommand(installerPath),
      ],
      { encoding: "utf8" },
    ).trim();

    const parsed = JSON.parse(raw || "{}");
    return {
      status: parsed.Status || "Unknown",
      statusMessage: parsed.StatusMessage || "",
      subject: parsed.Subject || "",
      timestamped: parsed.Timestamped === true,
    };
  } catch (e) {
    return {
      status: "Unknown",
      statusMessage: String(e.message || e),
      subject: "",
      timestamped: false,
    };
  }
}

export function evaluateInstallerArtifact({ installerPath, signature }) {
  if (!existsSync(installerPath)) {
    return {
      pass: false,
      installerExists: false,
      reason: "installer_missing",
      installerPath,
      detail: `missing ${installerPath}`,
    };
  }

  const sha256 = sha256File(installerPath);
  const signatureStatus = signature.status || "Unknown";
  const signer = signature.subject || "";
  const signerMatches = signer.includes(EXPECTED_SIGNER_SUBJECT);
  const timestamped = signature.timestamped === true;
  const signatureMessage =
    signatureStatus === "NotSigned"
      ? "The installer is not digitally signed."
      : signatureStatus === "Valid" && !signerMatches
        ? `Expected signer subject to include ${EXPECTED_SIGNER_SUBJECT}.`
      : signatureStatus === "Valid" && !timestamped
        ? "The installer signature is valid but is not timestamped."
      : signature.statusMessage || "";
  const valid = signatureStatus === "Valid" && signerMatches && timestamped;

  return {
    pass: valid,
    installerExists: true,
    reason:
      signatureStatus === "Valid" && !signerMatches
        ? "signer_mismatch"
        : signatureStatus === "Valid" && signerMatches && !timestamped
          ? "signature_not_timestamped"
        : valid
          ? "signed"
          : "not_signed",
    installerPath,
    sha256,
    signatureStatus,
    signatureMessage,
    signer,
    timestamped,
    detail: valid
      ? `signed${signer ? ` by ${signer}` : ""}; timestamped=true; sha256=${sha256}`
      : `signature_status=${signatureStatus}; sha256=${sha256}`,
  };
}

export function evaluateBuildIcon({
  root,
  packagePath = "desktop/package.json",
}) {
  const fullPackagePath = join(root, packagePath);
  const desktopPackage = readJson(root, packagePath);
  const configuredIcon = desktopPackage.build?.win?.icon || desktopPackage.build?.icon;

  if (!configuredIcon) {
    return {
      pass: false,
      reason: "icon_not_configured",
      iconPath: "",
      detail: "desktop/package.json -> build.win.icon is not configured",
    };
  }

  const iconPath = resolve(dirname(fullPackagePath), configuredIcon);
  const iconExists = existsSync(iconPath);
  return {
    pass: iconExists,
    reason: iconExists ? "icon_configured" : "icon_missing",
    iconPath,
    detail: iconExists ? iconPath : `missing ${iconPath}`,
  };
}

function hasNsisX64Target(target) {
  const targets = Array.isArray(target) ? target : [target];
  return targets.some((entry) => {
    if (entry === "nsis") return true;
    if (!entry || entry.target !== "nsis") return false;
    return !entry.arch || entry.arch.includes("x64");
  });
}

export function evaluateReleaseMetadata({
  root,
  packagePath = "desktop/package.json",
}) {
  const fullPackagePath = join(root, packagePath);
  const rootPackage = readOptionalJson(root, "package.json");
  const corePackage = readOptionalJson(root, "packages/core/package.json");
  const desktopPackage = readJson(root, packagePath);
  const build = desktopPackage.build || {};
  const missing = [];

  if (desktopPackage.author !== "Passive Print Labs LLC") {
    missing.push("author=Passive Print Labs LLC");
  }
  if (build.appId !== "com.passiveprintlabs.daybreak") {
    missing.push("build.appId=com.passiveprintlabs.daybreak");
  }
  if (build.productName !== "Daybreak") {
    missing.push("build.productName=Daybreak");
  }
  if (build.copyright !== EXPECTED_COPYRIGHT) {
    missing.push(`build.copyright=${EXPECTED_COPYRIGHT}`);
  }
  if (build.artifactName !== EXPECTED_ARTIFACT_NAME) {
    missing.push(`build.artifactName=${EXPECTED_ARTIFACT_NAME}`);
  }
  if (!desktopPackage.scripts?.package?.includes("--publish never")) {
    missing.push("scripts.package includes --publish never");
  }
  if (build.publish !== undefined) {
    missing.push("build.publish omitted");
  }
  if (
    desktopPackage.dependencies?.["electron-updater"] ||
    desktopPackage.devDependencies?.["electron-updater"]
  ) {
    missing.push("electron-updater absent");
  }
  if (
    !desktopPackage.version ||
    desktopPackage.version !== rootPackage?.version ||
    desktopPackage.version !== corePackage?.version
  ) {
    missing.push("workspace versions match");
  }
  if (!hasNsisX64Target(build.win?.target)) {
    missing.push("build.win.target=nsis x64");
  }
  if (build.nsis?.oneClick !== false) {
    missing.push("build.nsis.oneClick=false");
  }
  if (build.nsis?.allowToChangeInstallationDirectory !== true) {
    missing.push("build.nsis.allowToChangeInstallationDirectory=true");
  }
  if (build.nsis?.createDesktopShortcut !== true) {
    missing.push("build.nsis.createDesktopShortcut=true");
  }
  if (build.nsis?.createStartMenuShortcut !== true) {
    missing.push("build.nsis.createStartMenuShortcut=true");
  }
  if (build.nsis?.shortcutName !== "Daybreak") {
    missing.push("build.nsis.shortcutName=Daybreak");
  }
  if (build.nsis?.uninstallDisplayName !== "Daybreak") {
    missing.push("build.nsis.uninstallDisplayName=Daybreak");
  }
  if (typeof build.nsis?.license !== "string" || build.nsis.license.trim() === "") {
    missing.push("build.nsis.license");
  } else {
    const licensePath = resolve(dirname(fullPackagePath), build.nsis.license);
    if (!existsSync(licensePath)) {
      missing.push(`build.nsis.license file exists (${build.nsis.license})`);
    }
  }

  return {
    pass: missing.length === 0,
    reason: missing.length === 0 ? "metadata_configured" : "metadata_incomplete",
    detail:
      missing.length === 0
        ? `appId=com.passiveprintlabs.daybreak productName=Daybreak version=${desktopPackage.version} author=Passive Print Labs LLC target=nsis/x64 artifactName=${EXPECTED_ARTIFACT_NAME} publish=disabled shortcuts=Daybreak uninstall=Daybreak license=configured`
        : `missing ${missing.join(", ")}`,
  };
}

export function evaluatePackagedSmoke({ executablePath, runnerResult }) {
  if (!existsSync(executablePath)) {
    return {
      pass: false,
      executableExists: false,
      reason: "packaged_app_missing",
      executablePath,
      detail: `missing ${executablePath}`,
    };
  }

  if (!runnerResult) {
    return {
      pass: false,
      executableExists: true,
      reason: "packaged_smoke_not_run",
      executablePath,
      detail: "packaged app smoke did not run",
    };
  }

  const stdout = runnerResult.stdout || "";
  const stderr = runnerResult.stderr || "";
  const pass =
    runnerResult.status === 0 &&
    stdout.includes("DAYBREAK_SMOKE=pass") &&
    stdout.includes("renderer_loaded=true") &&
    stdout.includes("ipc_roundtrip=true") &&
    stdout.includes("app_menu_disabled=true") &&
    stdout.includes("devtools_disabled=true") &&
    stdout.includes("web_preferences=strict") &&
    stdout.includes("shortcuts_blocked=true") &&
    stdout.includes("close_probe=true") &&
    stdout.includes("swipe_flow=true");

  return {
    pass,
    executableExists: true,
    reason: pass ? "packaged_smoke_passed" : "packaged_smoke_failed",
    executablePath,
    status: runnerResult.status,
    signal: runnerResult.signal || "",
    stdout,
    stderr,
    detail: pass
      ? "packaged Daybreak.exe smoke passed"
      : `status=${runnerResult.status ?? "null"} signal=${
          runnerResult.signal || ""
        } stdout=${JSON.stringify(stdout.slice(0, 300))} stderr=${JSON.stringify(
          stderr.slice(0, 300),
        )}`,
  };
}

function getPackagedScenarioFailure({ scenario, result }) {
  if (!result.pass) return result.reason;

  const stdout = result.stdout || "";
  const requiredMarkers = [`scenario=${scenario}`];
  if (scenario === "evening") requiredMarkers.push("streak_summary=true");

  const missingMarkers = requiredMarkers.filter(
    (marker) => !stdout.includes(marker),
  );
  return missingMarkers.length
    ? `missing_${missingMarkers.join("_and_")}`
    : "";
}

export function evaluatePackagedSmokeSuite({
  executablePath,
  scenarioResults,
}) {
  if (!existsSync(executablePath)) {
    return {
      pass: false,
      executableExists: false,
      reason: "packaged_app_missing",
      executablePath,
      scenarios: [],
      failedScenarios: [],
      detail: `missing ${executablePath}`,
    };
  }

  const scenarios = scenarioResults.map(({ scenario }) => scenario);
  const failed = scenarioResults
    .map(({ scenario, result }) => ({
      scenario,
      result,
      reason: getPackagedScenarioFailure({ scenario, result }),
    }))
    .filter(({ reason }) => reason);
  const failedScenarios = failed.map(({ scenario }) => scenario);
  const pass = scenarioResults.length > 0 && failed.length === 0;

  return {
    pass,
    executableExists: true,
    reason: pass
      ? "packaged_smoke_suite_passed"
      : "packaged_smoke_suite_failed",
    executablePath,
    scenarios,
    failedScenarios,
    results: scenarioResults,
    detail: pass
      ? `packaged Daybreak.exe smoke passed for ${scenarios.join(",")}`
      : `packaged smoke failed for ${failed
          .map(({ scenario, reason }) => `${scenario}:${reason}`)
          .join(",")}`,
  };
}

export function runPackagedSmoke(
  executablePath,
  { scenario = "morning", attempts = 2, runner = spawnSync } = {},
) {
  if (!existsSync(executablePath)) {
    return evaluatePackagedSmoke({ executablePath, runnerResult: null });
  }

  const maxAttempts = Math.max(1, Math.floor(attempts));
  let lastResult = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const child = runner(executablePath, [], {
      cwd: dirname(executablePath),
      encoding: "utf8",
      timeout: 60_000,
      env: {
        ...process.env,
        DAYBREAK_SMOKE: "1",
        DAYBREAK_SMOKE_CLOSE_PROBE: "1",
        DAYBREAK_SMOKE_SCENARIO: scenario,
      },
    });

    const result = evaluatePackagedSmoke({
      executablePath,
      runnerResult: {
        status: child.status,
        signal: child.signal,
        stdout: child.stdout || "",
        stderr: child.stderr || child.error?.message || "",
      },
    });
    result.attempt = attempt;
    result.attempts = maxAttempts;
    lastResult = result;
    if (result.pass) return result;
  }

  return lastResult;
}

export function runPackagedSmokeSuite(
  executablePath,
  { scenarios = ["morning", "evening"] } = {},
) {
  if (!existsSync(executablePath)) {
    return evaluatePackagedSmokeSuite({ executablePath, scenarioResults: [] });
  }

  const scenarioResults = scenarios.map((scenario) => ({
    scenario,
    result: runPackagedSmoke(executablePath, { scenario }),
  }));

  return evaluatePackagedSmokeSuite({ executablePath, scenarioResults });
}

export function evaluateReleaseFreshness({
  installerPath,
  packagedAppPath,
  sourcePaths,
}) {
  if (!existsSync(installerPath)) {
    return {
      pass: false,
      reason: "installer_missing",
      staleSourcePaths: [],
      detail: `missing ${installerPath}`,
    };
  }
  if (!existsSync(packagedAppPath)) {
    return {
      pass: false,
      reason: "packaged_app_missing",
      staleSourcePaths: [],
      detail: `missing ${packagedAppPath}`,
    };
  }

  const artifactMtime = Math.min(mtimeMs(installerPath), mtimeMs(packagedAppPath));
  const staleSourcePaths = sourcePaths.filter(
    (sourcePath) => existsSync(sourcePath) && mtimeMs(sourcePath) > artifactMtime,
  );

  return {
    pass: staleSourcePaths.length === 0,
    reason:
      staleSourcePaths.length === 0
        ? "release_artifacts_current"
        : "release_artifacts_stale",
    staleSourcePaths,
    artifactMtime,
    detail:
      staleSourcePaths.length === 0
        ? "installer and packaged app are newer than release source inputs"
        : `release artifacts are older than ${staleSourcePaths.join(", ")}`,
  };
}

export function evaluateReleasePreflight({
  root,
  installerPath,
  signature,
  packagedSmoke,
  packagePath = "desktop/package.json",
  sourcePaths = collectReleaseSourcePaths({ root }).map((sourcePath) =>
    join(root, sourcePath),
  ),
}) {
  const installer = evaluateInstallerArtifact({ installerPath, signature });
  const icon = evaluateBuildIcon({ root, packagePath });
  const metadata = evaluateReleaseMetadata({ root, packagePath });
  const sourceMaps = evaluateSourceMapExclusion({
    distPath: join(dirname(join(root, packagePath)), "dist"),
  });
  const packagedAppPath = expectedPackagedAppPath(root, packagePath);
  const packagedSourceMaps = evaluatePackagedSourceMapExclusion({
    packagedAppAsarPath: expectedPackagedAppAsarPath(root, packagePath),
  });
  const packagedSource = evaluatePackagedSourceExclusion({
    packagedAppAsarPath: expectedPackagedAppAsarPath(root, packagePath),
  });
  const packagedDependencies = evaluatePackagedDependencyAllowlist({
    packagedAppAsarPath: expectedPackagedAppAsarPath(root, packagePath),
  });
  const packagedManifestMetadata = evaluatePackagedManifestMetadata({
    packagedAppAsarPath: expectedPackagedAppAsarPath(root, packagePath),
  });
  const sidecars = evaluateReleaseSidecarExclusion({
    releaseDir: dirname(installerPath),
  });
  const smoke =
    packagedSmoke ??
    evaluatePackagedSmoke({
      executablePath: packagedAppPath,
      runnerResult: null,
    });
  const freshness = evaluateReleaseFreshness({
    installerPath,
    packagedAppPath,
    sourcePaths,
  });

  return {
    ...installer,
    pass:
      installer.pass &&
      icon.pass &&
      metadata.pass &&
      sourceMaps.pass &&
      packagedSourceMaps.pass &&
      packagedSource.pass &&
      packagedDependencies.pass &&
      packagedManifestMetadata.pass &&
      sidecars.pass &&
      smoke.pass &&
      freshness.pass,
    icon,
    metadata,
    sourceMaps,
    packagedSourceMaps,
    packagedSource,
    packagedDependencies,
    packagedManifestMetadata,
    sidecars,
    packagedSmoke: smoke,
    freshness,
  };
}

export function renderReleaseReport(result) {
  const state = result.pass ? "ready" : "pending";
  const lines = [
    `# Daybreak release preflight - ${state}`,
    "",
    `installer_path=${result.installerPath}`,
    `installer_exists=${result.installerExists ? "true" : "false"}`,
  ];

  if (result.installerExists) {
    lines.push(`installer_sha256=${result.sha256}`);
    lines.push(`signature_status=${result.signatureStatus}`);
    if (result.signer) lines.push(`signer=${result.signer}`);
    if (result.signer) lines.push(`signature_timestamped=${result.timestamped ? "true" : "false"}`);
    if (result.signatureMessage) {
      lines.push(`signature_message=${result.signatureMessage}`);
    }
  } else {
    lines.push(`missing_reason=${result.detail}`);
  }

  if (result.icon) {
    lines.push(`icon_status=${result.icon.pass ? "configured" : "missing"}`);
    if (result.icon.iconPath) lines.push(`icon_path=${result.icon.iconPath}`);
    if (!result.icon.pass) lines.push(`icon_message=${result.icon.detail}`);
  }
  if (result.metadata) {
    lines.push(
      `metadata_status=${result.metadata.pass ? "configured" : "missing"}`,
    );
    if (!result.metadata.pass) {
      lines.push(`metadata_message=${result.metadata.detail}`);
    }
  }
  if (result.sourceMaps) {
    lines.push(
      `source_maps=${result.sourceMaps.pass ? "absent" : "present"}`,
    );
    if (!result.sourceMaps.pass) {
      lines.push(`source_maps_message=${result.sourceMaps.detail}`);
    }
  }
  if (result.packagedSourceMaps) {
    lines.push(
      `packaged_source_maps=${
        result.packagedSourceMaps.pass ? "absent" : "present"
      }`,
    );
    if (!result.packagedSourceMaps.pass) {
      lines.push(
        `packaged_source_maps_message=${result.packagedSourceMaps.detail}`,
      );
    }
  }
  if (result.packagedSource) {
    lines.push(
      `packaged_source=${result.packagedSource.pass ? "absent" : "present"}`,
    );
    if (!result.packagedSource.pass) {
      lines.push(`packaged_source_message=${result.packagedSource.detail}`);
    }
  }
  if (result.packagedDependencies) {
    lines.push(`packaged_dependencies=${result.packagedDependencies.dependencies.join(",") || "none"}`);
    if (!result.packagedDependencies.pass) {
      lines.push(
        `packaged_dependencies_message=${result.packagedDependencies.detail}`,
      );
    }
  }
  if (result.packagedManifestMetadata) {
    lines.push(
      `packaged_manifest_metadata=${
        result.packagedManifestMetadata.pass ? "absent" : "present"
      }`,
    );
    if (!result.packagedManifestMetadata.pass) {
      lines.push(
        `packaged_manifest_metadata_message=${result.packagedManifestMetadata.detail}`,
      );
    }
  }
  if (result.sidecars) {
    lines.push(`release_sidecars=${result.sidecars.pass ? "absent" : "present"}`);
    if (!result.sidecars.pass) {
      lines.push(`release_sidecars_message=${result.sidecars.detail}`);
    }
  }
  if (result.packagedSmoke) {
    lines.push(
      `packaged_smoke=${result.packagedSmoke.pass ? "pass" : "pending"}`,
    );
    lines.push(`packaged_app_path=${result.packagedSmoke.executablePath}`);
    if (result.packagedSmoke.scenarios?.length) {
      lines.push(
        `packaged_smoke_scenarios=${result.packagedSmoke.scenarios.join(",")}`,
      );
    }
    if (!result.packagedSmoke.pass) {
      lines.push(`packaged_smoke_message=${result.packagedSmoke.detail}`);
    }
  }
  if (result.freshness) {
    lines.push(
      `release_freshness=${result.freshness.pass ? "current" : "stale"}`,
    );
    if (!result.freshness.pass) {
      lines.push(`release_freshness_message=${result.freshness.detail}`);
    }
  }

  if (!result.pass) {
    const blockers = [];
    if (
      !result.signatureStatus ||
      result.signatureStatus !== "Valid" ||
      result.reason === "signer_mismatch" ||
      result.reason === "signature_not_timestamped"
    ) {
      blockers.push(
        "- Sign and timestamp the Windows installer with a real Passive Print Labs code-signing certificate before hosting it.",
      );
    }
    if (result.icon && !result.icon.pass) {
      blockers.push(
        "- Configure a real Windows application icon before shipping the installer.",
      );
    }
    if (result.metadata && !result.metadata.pass) {
      blockers.push(
        "- Configure Windows release metadata before shipping the installer.",
      );
    }
    if (result.sourceMaps && !result.sourceMaps.pass) {
      blockers.push(
        "- Rebuild the desktop bundle without source maps before signing or hosting the installer.",
      );
    }
    if (result.packagedSourceMaps && !result.packagedSourceMaps.pass) {
      blockers.push(
        "- Repackage the Windows app without source maps inside app.asar before signing or hosting the installer.",
      );
    }
    if (result.packagedSource && !result.packagedSource.pass) {
      blockers.push(
        "- Repackage the Windows app without TypeScript source files inside app.asar before signing or hosting the installer.",
      );
    }
    if (result.packagedDependencies && !result.packagedDependencies.pass) {
      blockers.push(
        "- Remove unexpected runtime dependencies from app.asar before signing or hosting the installer.",
      );
    }
    if (result.packagedManifestMetadata && !result.packagedManifestMetadata.pass) {
      blockers.push(
        "- Remove development metadata from packaged package manifests before signing or hosting the installer.",
      );
    }
    if (result.sidecars && !result.sidecars.pass) {
      blockers.push(
        "- Remove debug and update sidecar files from desktop/release before signing or hosting the installer.",
      );
    }
    if (result.packagedSmoke && !result.packagedSmoke.pass) {
      blockers.push(
        "- Run a passing smoke test against desktop/release/win-unpacked/Daybreak.exe before shipping the installer.",
      );
    }
    if (result.freshness && !result.freshness.pass) {
      blockers.push(
        "- Rebuild the Windows installer after the latest desktop/core source changes before signing or hosting it.",
      );
    }
    lines.push("", "## Remaining release blocker", "", ...blockers);
  }

  lines.push("", `DAYBREAK_RELEASE=${state}`);
  return lines.join("\n");
}
