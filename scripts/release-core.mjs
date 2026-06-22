import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export function readJson(root, relativePath) {
  return JSON.parse(readFileSync(join(root, relativePath), "utf8"));
}

export function expectedInstallerPath(root) {
  const desktopPackage = readJson(root, "desktop/package.json");
  const productName = desktopPackage.build?.productName || "Daybreak";
  const version = desktopPackage.version;
  return join(root, "desktop", "release", `${productName} Setup ${version}.exe`);
}

export function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function psString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function buildAuthenticodeCommand(installerPath) {
  return [
    `$sig = Get-AuthenticodeSignature -LiteralPath ${psString(installerPath)}`,
    "$subject = if ($sig.SignerCertificate) { [string]$sig.SignerCertificate.Subject } else { '' }",
    "[pscustomobject]@{",
    "Status = [string]$sig.Status;",
    "StatusMessage = [string]$sig.StatusMessage;",
    "Subject = $subject",
    "} | ConvertTo-Json -Compress",
  ].join("\n");
}

export function readAuthenticodeSignature(installerPath) {
  if (process.platform !== "win32") {
    return {
      status: "Unknown",
      statusMessage: "Authenticode signature check is only available on Windows.",
      subject: "",
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
    };
  } catch (e) {
    return {
      status: "Unknown",
      statusMessage: String(e.message || e),
      subject: "",
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
  const signatureMessage =
    signatureStatus === "NotSigned"
      ? "The installer is not digitally signed."
      : signature.statusMessage || "";
  const valid = signatureStatus === "Valid";

  return {
    pass: valid,
    installerExists: true,
    reason: valid ? "signed" : "not_signed",
    installerPath,
    sha256,
    signatureStatus,
    signatureMessage,
    signer,
    detail: valid
      ? `signed${signer ? ` by ${signer}` : ""}; sha256=${sha256}`
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

export function evaluateReleasePreflight({
  root,
  installerPath,
  signature,
  packagePath = "desktop/package.json",
}) {
  const installer = evaluateInstallerArtifact({ installerPath, signature });
  const icon = evaluateBuildIcon({ root, packagePath });

  return {
    ...installer,
    pass: installer.pass && icon.pass,
    icon,
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

  if (!result.pass) {
    const blockers = [];
    if (!result.signatureStatus || result.signatureStatus !== "Valid") {
      blockers.push(
        "- Sign the Windows installer with a real code-signing certificate before hosting it.",
      );
    }
    if (result.icon && !result.icon.pass) {
      blockers.push(
        "- Configure a real Windows application icon before shipping the installer.",
      );
    }
    lines.push("", "## Remaining release blocker", "", ...blockers);
  }

  lines.push("", `DAYBREAK_RELEASE=${state}`);
  return lines.join("\n");
}
