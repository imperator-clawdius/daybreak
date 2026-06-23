import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export const EXPECTED_SIGNER_SUBJECT = "Passive Print Labs LLC";

export function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
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

export const RELEASE_SOURCE_PATHS = [
  "desktop/package.json",
  "desktop/build.mjs",
  "desktop/src/main/main.ts",
  "desktop/src/main/preload.ts",
  "desktop/src/main/store.ts",
  "desktop/src/renderer/index.html",
  "desktop/src/renderer/renderer.css",
  "desktop/src/renderer/renderer.ts",
  "packages/core/package.json",
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
];

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
  if (!hasNsisX64Target(build.win?.target)) {
    missing.push("build.win.target=nsis x64");
  }
  if (build.nsis?.oneClick !== false) {
    missing.push("build.nsis.oneClick=false");
  }
  if (build.nsis?.allowToChangeInstallationDirectory !== true) {
    missing.push("build.nsis.allowToChangeInstallationDirectory=true");
  }

  return {
    pass: missing.length === 0,
    reason: missing.length === 0 ? "metadata_configured" : "metadata_incomplete",
    detail:
      missing.length === 0
        ? "appId=com.passiveprintlabs.daybreak productName=Daybreak author=Passive Print Labs LLC target=nsis/x64"
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

export function runPackagedSmoke(executablePath, { scenario = "morning" } = {}) {
  if (!existsSync(executablePath)) {
    return evaluatePackagedSmoke({ executablePath, runnerResult: null });
  }

  const child = spawnSync(executablePath, [], {
    cwd: dirname(executablePath),
    encoding: "utf8",
    timeout: 60_000,
    env: {
      ...process.env,
      DAYBREAK_SMOKE: "1",
      DAYBREAK_SMOKE_SCENARIO: scenario,
    },
  });

  return evaluatePackagedSmoke({
    executablePath,
    runnerResult: {
      status: child.status,
      signal: child.signal,
      stdout: child.stdout || "",
      stderr: child.stderr || child.error?.message || "",
    },
  });
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
  sourcePaths = RELEASE_SOURCE_PATHS.map((sourcePath) => join(root, sourcePath)),
}) {
  const installer = evaluateInstallerArtifact({ installerPath, signature });
  const icon = evaluateBuildIcon({ root, packagePath });
  const metadata = evaluateReleaseMetadata({ root, packagePath });
  const packagedAppPath = expectedPackagedAppPath(root, packagePath);
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
      smoke.pass &&
      freshness.pass,
    icon,
    metadata,
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
