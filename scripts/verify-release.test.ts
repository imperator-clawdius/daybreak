import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildAuthenticodeCommand,
  evaluateInstallerArtifact,
  renderReleaseReport,
} from "./release-core.mjs";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "daybreak-release-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("release preflight", () => {
  it("builds a valid PowerShell Authenticode command", () => {
    const command = buildAuthenticodeCommand(
      "C:\\Users\\Truet\\Projects\\daybreak\\desktop\\release\\Daybreak Setup 0.1.0.exe",
    );

    expect(command).toContain("[pscustomobject]@{");
    expect(command).not.toContain("@{;");
    expect(command).toContain("Status = [string]$sig.Status");
    expect(command).toContain("ConvertTo-Json -Compress");
  });

  it("keeps release pending when the installer is missing", () => {
    const result = evaluateInstallerArtifact({
      installerPath: join("missing", "Daybreak Setup 0.1.0.exe"),
      signature: { status: "Unknown", statusMessage: "", subject: "" },
    });

    expect(result).toMatchObject({
      pass: false,
      installerExists: false,
      reason: "installer_missing",
    });
  });

  it("computes SHA-256 but keeps an unsigned installer pending", () =>
    withTempDir((dir) => {
      const installerPath = join(dir, "Daybreak Setup 0.1.0.exe");
      writeFileSync(installerPath, "hello", "utf8");

      const result = evaluateInstallerArtifact({
        installerPath,
        signature: {
          status: "NotSigned",
          statusMessage: "about_Execution_Policies noise",
          subject: "",
        },
      });

      expect(result).toMatchObject({
        pass: false,
        installerExists: true,
        reason: "not_signed",
        signatureStatus: "NotSigned",
        signatureMessage: "The installer is not digitally signed.",
        sha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      });
    }));

  it("passes only when the installer exists and Authenticode status is valid", () =>
    withTempDir((dir) => {
      const installerPath = join(dir, "Daybreak Setup 0.1.0.exe");
      writeFileSync(installerPath, "hello", "utf8");

      const result = evaluateInstallerArtifact({
        installerPath,
        signature: {
          status: "Valid",
          statusMessage: "",
          subject: "CN=Passive Print Labs LLC",
        },
      });

      expect(result).toMatchObject({
        pass: true,
        installerExists: true,
        reason: "signed",
        signatureStatus: "Valid",
        signer: "CN=Passive Print Labs LLC",
      });
    }));

  it("renders an honest pending report with checksum and signature status", () =>
    withTempDir((dir) => {
      const installerPath = join(dir, "Daybreak Setup 0.1.0.exe");
      writeFileSync(installerPath, "hello", "utf8");

      const result = evaluateInstallerArtifact({
        installerPath,
        signature: { status: "NotSigned", statusMessage: "", subject: "" },
      });

      expect(renderReleaseReport(result)).toContain("DAYBREAK_RELEASE=pending");
      expect(renderReleaseReport(result)).toContain("signature_status=NotSigned");
      expect(renderReleaseReport(result)).toContain(
        "installer_sha256=2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      );
    }));
});
