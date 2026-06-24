import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  EXPECTED_ARTIFACT_NAME,
  EXPECTED_COPYRIGHT,
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
  evaluatePackagedDependencyAllowlist,
  evaluatePackagedManifestMetadata,
  evaluateReleaseSidecarExclusion,
  cleanReleaseSidecars,
  readJson,
  renderReleaseReport,
  runPackagedSmoke,
} from "./release-core.mjs";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "daybreak-release-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function validWindowsReleaseMetadata() {
  return {
    copyright: EXPECTED_COPYRIGHT,
    artifactName: EXPECTED_ARTIFACT_NAME,
    win: {
      target: [{ target: "nsis", arch: ["x64"] }],
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      createStartMenuShortcut: true,
      shortcutName: "Daybreak",
      uninstallDisplayName: "Daybreak",
      license: "installer-license.txt",
    },
  };
}

function validDesktopPackageScripts() {
  return {
    package:
      "npm run bundle && electron-builder --win --publish never && node ../scripts/clean-release-sidecars.mjs",
  };
}

describe("release preflight", () => {
  it("declares the asar reader used by release preflight as a direct dev dependency", () => {
    const rootPackage = readJson(process.cwd(), "package.json");

    expect(rootPackage.devDependencies).toMatchObject({
      "@electron/asar": expect.any(String),
    });
  });

  it("cleans release sidecars after desktop packaging", () => {
    const desktopPackage = readJson(process.cwd(), "desktop/package.json");

    expect(desktopPackage.scripts.package).toContain(
      "clean-release-sidecars.mjs",
    );
  });

  it("slims packaged manifests before building the installer", () => {
    const desktopPackage = readJson(process.cwd(), "desktop/package.json");

    expect(desktopPackage.build.afterPack).toBe(
      "../scripts/slim-packaged-manifests.mjs",
    );
  });

  it("publishes support and terms contact details in the installer license", () => {
    const license = readFileSync(
      join(process.cwd(), "desktop", "assets", "installer-license.txt"),
      "utf8",
    );

    expect(license).toContain("founder@daybreak.rest");
    expect(license).toContain("https://daybreak.rest/terms/");
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
        "desktop/assets/installer-license.txt",
        "desktop/tsconfig.json",
        "packages/core/tsconfig.json",
        "scripts/slim-packaged-manifests.mjs",
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
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "0.1.0" }));
      mkdirSync(join(dir, "packages", "core"), { recursive: true });
      writeFileSync(
        join(dir, "packages", "core", "package.json"),
        JSON.stringify({ version: "0.1.0" }),
      );
      writeFileSync(join(dir, "installer-license.txt"), "Daybreak license");
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({
          version: "0.1.0",
          author: "Passive Print Labs LLC",
          scripts: validDesktopPackageScripts(),
          build: {
            appId: "com.passiveprintlabs.daybreak",
            productName: "Daybreak",
            ...validWindowsReleaseMetadata(),
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

  it("keeps release metadata pending when Windows shell metadata is incomplete", () =>
    withTempDir((dir) => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "0.1.0" }));
      mkdirSync(join(dir, "packages", "core"), { recursive: true });
      writeFileSync(
        join(dir, "packages", "core", "package.json"),
        JSON.stringify({ version: "0.1.0" }),
      );
      writeFileSync(join(dir, "installer-license.txt"), "Daybreak license");
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({
          version: "0.1.0",
          author: "Passive Print Labs LLC",
          scripts: validDesktopPackageScripts(),
          build: {
            appId: "com.passiveprintlabs.daybreak",
            productName: "Daybreak",
            win: {
              target: [{ target: "nsis", arch: ["x64"] }],
            },
            nsis: {
              oneClick: false,
              allowToChangeInstallationDirectory: true,
              license: "installer-license.txt",
            },
          },
        }),
      );

      const metadata = evaluateReleaseMetadata({
        root: dir,
        packagePath: "desktop-package.json",
      });

      expect(metadata).toMatchObject({
        pass: false,
        reason: "metadata_incomplete",
      });
      expect(metadata.detail).toContain(
        "build.artifactName=${productName} Setup ${version}.${ext}",
      );
      expect(metadata.detail).toContain(
        "build.copyright=Copyright (c) 2026 Passive Print Labs LLC",
      );
      expect(metadata.detail).toContain("build.nsis.shortcutName=Daybreak");
      expect(metadata.detail).toContain("build.nsis.uninstallDisplayName=Daybreak");
    }));

  it("keeps release metadata pending when publish or auto-update policy is enabled", () =>
    withTempDir((dir) => {
      writeFileSync(join(dir, "package.json"), JSON.stringify({ version: "0.1.0" }));
      mkdirSync(join(dir, "packages", "core"), { recursive: true });
      writeFileSync(
        join(dir, "packages", "core", "package.json"),
        JSON.stringify({ version: "0.1.0" }),
      );
      writeFileSync(join(dir, "installer-license.txt"), "Daybreak license");
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({
          version: "0.1.0",
          author: "Passive Print Labs LLC",
          scripts: {
            package: "npm run bundle && electron-builder --win",
          },
          dependencies: {
            "electron-updater": "6.0.0",
          },
          build: {
            appId: "com.passiveprintlabs.daybreak",
            productName: "Daybreak",
            publish: [{ provider: "github" }],
            ...validWindowsReleaseMetadata(),
          },
        }),
      );

      const metadata = evaluateReleaseMetadata({
        root: dir,
        packagePath: "desktop-package.json",
      });

      expect(metadata).toMatchObject({
        pass: false,
        reason: "metadata_incomplete",
      });
      expect(metadata.detail).toContain("scripts.package includes --publish never");
      expect(metadata.detail).toContain("build.publish omitted");
      expect(metadata.detail).toContain("electron-updater absent");
    }));

  it("keeps release metadata pending when the NSIS installer license is missing", () =>
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
        pass: false,
        reason: "metadata_incomplete",
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
            "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning app_menu_disabled=true devtools_disabled=true web_preferences=strict background_throttling=disabled shortcuts_blocked=true single_instance_lock=true window_chrome=locked permissions_denied=true certificate_errors_rejected=true redirects_guarded=true frame_navigation_guarded=true drag_drop_guarded=true downloads_blocked=true content_protection=requested content_protection_status=disabled power_save_blocker=started close_probe=true swipe_flow=true",
          stderr: "",
        },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: "packaged_smoke_passed",
        executableExists: true,
      });
    }));

  it("keeps release pending when packaged smoke does not prove close prevention", () =>
    withTempDir((dir) => {
      const executablePath = join(dir, "Daybreak.exe");
      writeFileSync(executablePath, "exe", "utf8");

      expect(
        evaluatePackagedSmoke({
          executablePath,
          runnerResult: {
            status: 0,
            signal: null,
            stdout:
              "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning swipe_flow=true",
            stderr: "",
          },
        }),
      ).toMatchObject({
        pass: false,
        reason: "packaged_smoke_failed",
      });
    }));

  it("retries packaged smoke once when the first launch misses a required marker", () =>
    withTempDir((dir) => {
      const executablePath = join(dir, "Daybreak.exe");
      writeFileSync(executablePath, "exe", "utf8");
      let calls = 0;

      const result = runPackagedSmoke(executablePath, {
        scenario: "morning",
        attempts: 2,
        runner: () => {
          calls += 1;
          return calls === 1
            ? {
                status: 0,
                signal: null,
                stdout:
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning close_probe=true swipe_flow=true",
                stderr: "",
              }
            : {
                status: 0,
                signal: null,
                stdout:
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning app_menu_disabled=true devtools_disabled=true web_preferences=strict background_throttling=disabled shortcuts_blocked=true single_instance_lock=true window_chrome=locked permissions_denied=true certificate_errors_rejected=true redirects_guarded=true frame_navigation_guarded=true drag_drop_guarded=true downloads_blocked=true content_protection=requested content_protection_status=disabled power_save_blocker=started close_probe=true swipe_flow=true",
                stderr: "",
              };
        },
      });

      expect(result).toMatchObject({
        pass: true,
        reason: "packaged_smoke_passed",
        attempt: 2,
        attempts: 2,
      });
      expect(calls).toBe(2);
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
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning app_menu_disabled=true devtools_disabled=true web_preferences=strict background_throttling=disabled shortcuts_blocked=true single_instance_lock=true window_chrome=locked permissions_denied=true certificate_errors_rejected=true redirects_guarded=true frame_navigation_guarded=true drag_drop_guarded=true downloads_blocked=true content_protection=requested content_protection_status=disabled power_save_blocker=started close_probe=true swipe_flow=true",
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
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=evening app_menu_disabled=true devtools_disabled=true web_preferences=strict background_throttling=disabled shortcuts_blocked=true single_instance_lock=true window_chrome=locked permissions_denied=true certificate_errors_rejected=true redirects_guarded=true frame_navigation_guarded=true drag_drop_guarded=true downloads_blocked=true content_protection=requested content_protection_status=disabled power_save_blocker=started close_probe=true swipe_flow=true streak_summary=true",
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
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning app_menu_disabled=true devtools_disabled=true web_preferences=strict background_throttling=disabled shortcuts_blocked=true single_instance_lock=true window_chrome=locked permissions_denied=true certificate_errors_rejected=true redirects_guarded=true frame_navigation_guarded=true drag_drop_guarded=true downloads_blocked=true content_protection=requested content_protection_status=disabled power_save_blocker=started close_probe=true swipe_flow=true",
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
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=morning app_menu_disabled=true devtools_disabled=true web_preferences=strict background_throttling=disabled shortcuts_blocked=true single_instance_lock=true window_chrome=locked permissions_denied=true certificate_errors_rejected=true redirects_guarded=true frame_navigation_guarded=true drag_drop_guarded=true downloads_blocked=true content_protection=requested content_protection_status=disabled power_save_blocker=started close_probe=true swipe_flow=true",
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
                  "DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true scenario=evening app_menu_disabled=true devtools_disabled=true web_preferences=strict background_throttling=disabled shortcuts_blocked=true single_instance_lock=true window_chrome=locked permissions_denied=true certificate_errors_rejected=true redirects_guarded=true frame_navigation_guarded=true drag_drop_guarded=true downloads_blocked=true content_protection=requested content_protection_status=disabled power_save_blocker=started close_probe=true swipe_flow=true",
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

  it("keeps release metadata pending when workspace versions drift", () =>
    withTempDir((dir) => {
      writeFileSync(
        join(dir, "package.json"),
        JSON.stringify({ version: "0.1.1" }),
      );
      mkdirSync(join(dir, "packages", "core"), { recursive: true });
      writeFileSync(
        join(dir, "packages", "core", "package.json"),
        JSON.stringify({ version: "0.1.0" }),
      );
      writeFileSync(join(dir, "installer-license.txt"), "Daybreak license");
      writeFileSync(
        join(dir, "desktop-package.json"),
        JSON.stringify({
          version: "0.1.0",
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
              license: "installer-license.txt",
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

  it("keeps release pending when unexpected runtime dependencies are packaged", () =>
    withTempDir((dir) => {
      const asarPath = join(dir, "resources", "app.asar");
      mkdirSync(join(dir, "resources"), { recursive: true });
      writeFileSync(asarPath, "synthetic asar placeholder", "utf8");

      expect(
        evaluatePackagedDependencyAllowlist({
          packagedAppAsarPath: asarPath,
          listAsarFiles: () => [
            "/node_modules/@daybreak/core/dist/index.js",
            "/node_modules/@analytics/sdk/index.js",
            "/node_modules/lodash/index.js",
            "/dist/main.js",
          ],
        }),
      ).toMatchObject({
        pass: false,
        reason: "packaged_dependencies_unexpected",
        dependencies: ["@analytics/sdk", "@daybreak/core", "lodash"],
        unexpectedDependencies: ["@analytics/sdk", "lodash"],
      });
    }));

  it("keeps release pending when packaged manifests expose development metadata", () =>
    withTempDir((dir) => {
      const asarPath = join(dir, "resources", "app.asar");
      mkdirSync(join(dir, "resources"), { recursive: true });
      writeFileSync(asarPath, "synthetic asar placeholder", "utf8");
      const readPaths: string[] = [];

      expect(
        evaluatePackagedManifestMetadata({
          packagedAppAsarPath: asarPath,
          listAsarFiles: () => [
            "\\package.json",
            "\\node_modules\\@daybreak\\core\\package.json",
          ],
          readAsarText: (_asarPath, filePath) => {
            readPaths.push(filePath);
            return filePath === "/package.json"
              ? JSON.stringify({
                  name: "@daybreak/desktop",
                  version: "0.1.0",
                  main: "dist/main.js",
                  scripts: { dev: "electron ." },
                })
              : JSON.stringify({
                  name: "@daybreak/core",
                  version: "0.1.0",
                  type: "module",
                  main: "./dist/index.js",
                  scripts: { test: "vitest run" },
                  devDependencies: { vitest: "^4.1.9" },
                });
          },
        }),
      ).toMatchObject({
        pass: false,
        reason: "packaged_manifest_metadata_present",
        manifestIssues: [
          "/node_modules/@daybreak/core/package.json:devDependencies",
          "/node_modules/@daybreak/core/package.json:scripts",
          "/package.json:scripts",
        ],
      });
      expect(readPaths).toEqual([
        "/node_modules/@daybreak/core/package.json",
        "/package.json",
      ]);
    }));

  it("keeps release pending when debug or update sidecars remain in the release directory", () =>
    withTempDir((dir) => {
      const releaseDir = join(dir, "release");
      mkdirSync(releaseDir, { recursive: true });
      writeFileSync(join(releaseDir, "Daybreak Setup 0.1.0.exe"), "installer", "utf8");
      writeFileSync(join(releaseDir, "builder-debug.yml"), "local paths", "utf8");
      writeFileSync(join(releaseDir, "Daybreak Setup 0.1.0.exe.blockmap"), "blockmap", "utf8");

      expect(evaluateReleaseSidecarExclusion({ releaseDir })).toMatchObject({
        pass: false,
        reason: "release_sidecars_present",
        sidecarPaths: [
          join(releaseDir, "Daybreak Setup 0.1.0.exe.blockmap"),
          join(releaseDir, "builder-debug.yml"),
        ],
      });
    }));

  it("removes debug and update sidecars without deleting the installer", () =>
    withTempDir((dir) => {
      const releaseDir = join(dir, "release");
      const installerPath = join(releaseDir, "Daybreak Setup 0.1.0.exe");
      const debugPath = join(releaseDir, "builder-debug.yml");
      const blockmapPath = join(releaseDir, "Daybreak Setup 0.1.0.exe.blockmap");
      mkdirSync(releaseDir, { recursive: true });
      writeFileSync(installerPath, "installer", "utf8");
      writeFileSync(debugPath, "local paths", "utf8");
      writeFileSync(blockmapPath, "blockmap", "utf8");

      const result = cleanReleaseSidecars({ releaseDir });

      expect(result.removedPaths).toEqual([blockmapPath, debugPath]);
      expect(existsSync(installerPath)).toBe(true);
      expect(existsSync(debugPath)).toBe(false);
      expect(existsSync(blockmapPath)).toBe(false);
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
