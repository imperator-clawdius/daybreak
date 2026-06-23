import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  RELEASE_SOURCE_PATHS,
  buildAuthenticodeCommand,
  buildAsarListCommand,
  collectReleaseSourcePaths,
  evaluateBuildIcon,
  evaluateInstallerArtifact,
  evaluatePackagedSmoke,
  evaluatePackagedSmokeSuite,
  evaluateReleaseFreshness,
  evaluateReleaseMetadata,
  evaluateReleasePreflight,
  evaluateSourceMapExclusion,
  evaluatePackagedSourceMapExclusion,
  evaluatePackagedSourceExclusion,
  readJson,
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
  it("declares the asar reader used by release preflight as a direct dev dependency", () => {
    const rootPackage = readJson(process.cwd(), "package.json");

    expect(rootPackage.devDependencies).toMatchObject({
      "@electron/asar": expect.any(String),
    });
  });

  it("runs the local asar CLI through node for packaged artifact inspection", () => {
    const command = buildAsarListCommand({
      root: "C:\\repo",
      packagedAppAsarPath: "C:\\repo\\desktop\\release\\win-unpacked\\resources\\app.asar",
    });

    expect(command.executablePath).toBe(process.execPath);
    expect(command.args).toEqual([
      join("C:\\repo", "node_modules", "@electron", "asar", "bin", "asar.js"),
      "list",
      "C:\\repo\\desktop\\release\\win-unpacked\\resources\\app.asar",
    ]);
  });

  it("treats dependency manifests and icon assets as release inputs", () => {
    expect(RELEASE_SOURCE_PATHS).toEqual(
      expect.arrayContaining([
        "package.json",
        "package-lock.json",
        "desktop/assets/icon.ico",
        "desktop/assets/icon.png",
        "desktop/tsconfig.json",
        "packages/core/tsconfig.json",
      ]),
    );
  });

  it("discovers release source inputs without test or release artifacts", () =>
    withTempDir((dir) => {
      const files = [
        "package.json",
        "package-lock.json",
        "desktop/package.json",
        "desktop/tsconfig.json",
        "desktop/build.mjs",
        "desktop/assets/icon.ico",
        "desktop/src/main/main.ts",
        "desktop/src/renderer/renderer.ts",
        "desktop/test/store.test.ts",
        "desktop/release/Daybreak Setup 0.1.0.exe",
        "packages/core/package.json",
        "packages/core/tsconfig.json",
        "packages/core/src/index.ts",
        "packages/core/test/wipe.test.ts",
      ];
      for (const file of files) {
        mkdirSync(join(dir, file, ".."), { recursive: true });
        writeFileSync(join(dir, file), "x", "utf8");
      }

      expect(collectReleaseSourcePaths({ root: dir })).toEqual([
        "desktop/assets/icon.ico",
        "desktop/build.mjs",
        "desktop/package.json",
        "desktop/src/main/main.ts",
        "desktop/src/renderer/renderer.ts",
        "desktop/tsconfig.json",
        "package-lock.json",
        "package.json",
        "packages/core/package.json",
        "packages/core/src/index.ts",
        "packages/core/tsconfig.json",
      ]);
    }));

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
          timestamped: true,
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

  it("keeps release pending when a valid signature is not timestamped", () =>
    withTempDir((dir) => {
      const installerPath = join(dir, "Daybreak Setup 0.1.0.exe");
      writeFileSync(installerPath, "hello", "utf8");

      const result = evaluateInstallerArtifact({
        installerPath,
        signature: {
          status: "Valid",
          statusMessage: "",
          subject: "CN=Passive Print Labs LLC",
          timestamped: false,
        },
      });

      expect(result).toMatchObject({
        pass: false,
        reason: "signature_not_timestamped",
        signatureStatus: "Valid",
        signer: "CN=Passive Print Labs LLC",
      });
    }));

  it("keeps release pending when the valid signature is from the wrong publisher", () =>
    withTempDir((dir) => {
      const installerPath = join(dir, "Daybreak Setup 0.1.0.exe");
      writeFileSync(installerPath, "hello", "utf8");

      const result = evaluateInstallerArtifact({
        installerPath,
        signature: {
          status: "Valid",
          statusMessage: "",
          subject: "CN=Unrelated Publisher LLC",
          timestamped: true,
        },
      });

      expect(result).toMatchObject({
        pass: false,
        reason: "signer_mismatch",
        signatureStatus: "Valid",
        signer: "CN=Unrelated Publisher LLC",
      });
      expect(renderReleaseReport(result)).toContain(
        "Sign and timestamp the Windows installer with a real Passive Print Labs code-signing certificate before hosting it.",
      );
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

  it("keeps release pending when the Windows app icon is not configured", () =>
    withTempDir((dir) => {
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({ build: { productName: "Daybreak", win: {} } }),
      );

      const icon = evaluateBuildIcon({
        root: dir,
        packagePath: "desktop-package.json",
      });

      expect(icon).toMatchObject({
        pass: false,
        reason: "icon_not_configured",
      });
    }));

  it("passes the icon check only when the configured icon exists", () =>
    withTempDir((dir) => {
      writeFileSync(join(dir, "daybreak.ico"), "ico-bytes");
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({
          build: { productName: "Daybreak", win: { icon: "daybreak.ico" } },
        }),
      );

      const icon = evaluateBuildIcon({
        root: dir,
        packagePath: "desktop-package.json",
      });

      expect(icon).toMatchObject({
        pass: true,
        reason: "icon_configured",
      });
    }));

  it("passes release metadata only when app identity and NSIS target are configured", () =>
    withTempDir((dir) => {
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({
          author: "Passive Print Labs LLC",
          build: {
            appId: "com.passiveprintlabs.daybreak",
            productName: "Daybreak",
            win: {
              target: [{ target: "nsis", arch: ["x64"] }],
            },
            nsis: {
              oneClick: false,
              allowToChangeInstallationDirectory: true,
            },
          },
        }),
      );

      expect(
        evaluateReleaseMetadata({
          root: dir,
          packagePath: "desktop-package.json",
        }),
      ).toMatchObject({
        pass: true,
        reason: "metadata_configured",
      });
    }));

  it("passes packaged smoke only when the packaged app exits cleanly with the smoke marker", () =>
    withTempDir((dir) => {
      const executablePath = join(dir, "Daybreak.exe");
      writeFileSync(executablePath, "exe", "utf8");

      const result = evaluatePackagedSmoke({
        executablePath,
        runnerResult: {
          status: 0,
          signal: null,
          stdout:
            "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning swipe_flow=true",
          stderr: "",
        },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: "packaged_smoke_passed",
        executableExists: true,
      });
    }));

  it("keeps release pending when packaged smoke does not prove the app runtime", () =>
    withTempDir((dir) => {
      const executablePath = join(dir, "Daybreak.exe");
      writeFileSync(executablePath, "exe", "utf8");

      expect(
        evaluatePackagedSmoke({
          executablePath,
          runnerResult: {
            status: 1,
            signal: null,
            stdout: "",
            stderr: "crashed before renderer loaded",
          },
        }),
      ).toMatchObject({
        pass: false,
        reason: "packaged_smoke_failed",
      });
    }));

  it("passes packaged smoke suite only when morning and evening packaged flows pass", () =>
    withTempDir((dir) => {
      const executablePath = join(dir, "Daybreak.exe");
      writeFileSync(executablePath, "exe", "utf8");

      const result = evaluatePackagedSmokeSuite({
        executablePath,
        scenarioResults: [
          {
            scenario: "morning",
            result: evaluatePackagedSmoke({
              executablePath,
              runnerResult: {
                status: 0,
                signal: null,
                stdout:
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning swipe_flow=true",
                stderr: "",
              },
            }),
          },
          {
            scenario: "evening",
            result: evaluatePackagedSmoke({
              executablePath,
              runnerResult: {
                status: 0,
                signal: null,
                stdout:
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=evening swipe_flow=true streak_summary=true",
                stderr: "",
              },
            }),
          },
        ],
      });

      expect(result).toMatchObject({
        pass: true,
        reason: "packaged_smoke_suite_passed",
        scenarios: ["morning", "evening"],
      });
    }));

  it("keeps release pending when any packaged smoke scenario fails", () =>
    withTempDir((dir) => {
      const executablePath = join(dir, "Daybreak.exe");
      writeFileSync(executablePath, "exe", "utf8");

      const result = evaluatePackagedSmokeSuite({
        executablePath,
        scenarioResults: [
          {
            scenario: "morning",
            result: evaluatePackagedSmoke({
              executablePath,
              runnerResult: {
                status: 0,
                signal: null,
                stdout:
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning swipe_flow=true",
                stderr: "",
              },
            }),
          },
          {
            scenario: "evening",
            result: evaluatePackagedSmoke({
              executablePath,
              runnerResult: {
                status: 1,
                signal: null,
                stdout: "DAYBREAK_SMOKE=fail",
                stderr: "streak did not render",
              },
            }),
          },
        ],
      });

      expect(result).toMatchObject({
        pass: false,
        reason: "packaged_smoke_suite_failed",
        failedScenarios: ["evening"],
      });
    }));

  it("keeps release pending when evening packaged smoke omits streak proof", () =>
    withTempDir((dir) => {
      const executablePath = join(dir, "Daybreak.exe");
      writeFileSync(executablePath, "exe", "utf8");

      const result = evaluatePackagedSmokeSuite({
        executablePath,
        scenarioResults: [
          {
            scenario: "morning",
            result: evaluatePackagedSmoke({
              executablePath,
              runnerResult: {
                status: 0,
                signal: null,
                stdout:
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning swipe_flow=true",
                stderr: "",
              },
            }),
          },
          {
            scenario: "evening",
            result: evaluatePackagedSmoke({
              executablePath,
              runnerResult: {
                status: 0,
                signal: null,
                stdout:
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=evening swipe_flow=true",
                stderr: "",
              },
            }),
          },
        ],
      });

      expect(result).toMatchObject({
        pass: false,
        reason: "packaged_smoke_suite_failed",
        failedScenarios: ["evening"],
      });
    }));

  it("keeps release metadata pending when app identity is incomplete", () =>
    withTempDir((dir) => {
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({
          author: "",
          build: {
            productName: "Daybreak",
            win: { target: [{ target: "nsis", arch: ["x64"] }] },
          },
        }),
      );

      expect(
        evaluateReleaseMetadata({
          root: dir,
          packagePath: "desktop-package.json",
        }),
      ).toMatchObject({
        pass: false,
        reason: "metadata_incomplete",
      });
    }));

  it("keeps release pending when installer artifacts are older than source inputs", () =>
    withTempDir((dir) => {
      const installerPath = join(dir, "Daybreak Setup 0.1.0.exe");
      const executablePath = join(dir, "Daybreak.exe");
      const sourcePath = join(dir, "main.ts");
      writeFileSync(installerPath, "installer", "utf8");
      writeFileSync(executablePath, "exe", "utf8");
      writeFileSync(sourcePath, "source", "utf8");

      const oldTime = new Date("2026-06-22T12:00:00Z");
      const newTime = new Date("2026-06-22T22:00:00Z");
      utimesSync(installerPath, oldTime, oldTime);
      utimesSync(executablePath, oldTime, oldTime);
      utimesSync(sourcePath, newTime, newTime);

      const freshness = evaluateReleaseFreshness({
        installerPath,
        packagedAppPath: executablePath,
        sourcePaths: [sourcePath],
      });

      expect(freshness).toMatchObject({
        pass: false,
        reason: "release_artifacts_stale",
        staleSourcePaths: [sourcePath],
      });
    }));

  it("keeps release pending when desktop source maps would be packaged", () =>
    withTempDir((dir) => {
      const distPath = join(dir, "dist");
      mkdirSync(distPath, { recursive: true });
      writeFileSync(join(distPath, "main.js"), "compiled", "utf8");
      writeFileSync(join(distPath, "main.js.map"), "source map", "utf8");

      expect(evaluateSourceMapExclusion({ distPath })).toMatchObject({
        pass: false,
        reason: "source_maps_present",
        sourceMapPaths: [join(distPath, "main.js.map")],
      });
    }));

  it("keeps release pending when source maps are already inside the packaged app", () =>
    withTempDir((dir) => {
      const asarPath = join(dir, "resources", "app.asar");
      mkdirSync(join(dir, "resources"), { recursive: true });
      writeFileSync(asarPath, "synthetic asar placeholder", "utf8");

      expect(
        evaluatePackagedSourceMapExclusion({
          packagedAppAsarPath: asarPath,
          listAsarFiles: () => ["/dist/main.js", "/dist/main.js.map"],
        }),
      ).toMatchObject({
        pass: false,
        reason: "packaged_source_maps_present",
        sourceMapPaths: ["/dist/main.js.map"],
      });
    }));

  it("keeps release pending when TypeScript source is inside the packaged app", () =>
    withTempDir((dir) => {
      const asarPath = join(dir, "resources", "app.asar");
      mkdirSync(join(dir, "resources"), { recursive: true });
      writeFileSync(asarPath, "synthetic asar placeholder", "utf8");

      expect(
        evaluatePackagedSourceExclusion({
          packagedAppAsarPath: asarPath,
          listAsarFiles: () => [
            "/dist/main.js",
            "/node_modules/@daybreak/core/dist/index.js",
            "/node_modules/@daybreak/core/src/index.ts",
            "/node_modules/@daybreak/core/tsconfig.json",
          ],
        }),
      ).toMatchObject({
        pass: false,
        reason: "packaged_source_present",
        sourcePaths: [
          "/node_modules/@daybreak/core/src/index.ts",
          "/node_modules/@daybreak/core/tsconfig.json",
        ],
      });
    }));

  it("keeps the release pending if signing passes but icon proof is missing", () =>
    withTempDir((dir) => {
      const installerPath = join(dir, "Daybreak Setup 0.1.0.exe");
      writeFileSync(installerPath, "hello", "utf8");
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({ build: { productName: "Daybreak", win: {} } }),
      );

      const result = evaluateReleasePreflight({
        root: dir,
        installerPath,
        packagePath: "desktop-package.json",
        signature: {
          status: "Valid",
          statusMessage: "",
          subject: "CN=Test",
          timestamped: true,
        },
      });

      expect(result).toMatchObject({
        pass: false,
        icon: { pass: false, reason: "icon_not_configured" },
      });
      expect(renderReleaseReport(result)).toContain("icon_status=missing");
    }));
});
