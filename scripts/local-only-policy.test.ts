import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  evaluateLocalOnlyPolicy,
  renderLocalOnlyReport,
} from "./local-only-core.mjs";

type PackageJson = {
  scripts?: Record<string, string>;
};

function rootPackageJson(): PackageJson {
  return JSON.parse(readFileSync("package.json", "utf8")) as PackageJson;
}

describe("local-only desktop policy", () => {
  it("has a root verifier command for the no-telemetry promise", () => {
    expect(rootPackageJson().scripts?.["verify:local-only"]).toBe(
      "node scripts/verify-local-only.mjs",
    );
  });

  it("passes when desktop runtime has no outbound network APIs or telemetry dependencies", () => {
    const result = evaluateLocalOnlyPolicy({
      files: [
        { path: "desktop/src/main/main.ts", text: "app.whenReady();" },
        { path: "desktop/src/renderer/renderer.ts", text: "window.daybreak.load();" },
      ],
      dependencies: { "@daybreak/core": "*" },
    });

    expect(result.pass).toBe(true);
    expect(renderLocalOnlyReport(result)).toContain("LOCAL_ONLY=pass");
  });

  it("fails when desktop runtime uses outbound network or telemetry APIs", () => {
    const result = evaluateLocalOnlyPolicy({
      files: [
        { path: "desktop/src/renderer/renderer.ts", text: "navigator.sendBeacon('/event');" },
        { path: "desktop/src/main/main.ts", text: "import https from 'node:https';" },
      ],
      dependencies: { posthog: "latest" },
    });

    expect(result.pass).toBe(false);
    expect(renderLocalOnlyReport(result)).toContain("LOCAL_ONLY=fail");
    expect(renderLocalOnlyReport(result)).toContain("navigator.sendBeacon");
    expect(renderLocalOnlyReport(result)).toContain("node:https");
    expect(renderLocalOnlyReport(result)).toContain("posthog");
  });

  it("fails when desktop static assets reference remote network URLs", () => {
    const result = evaluateLocalOnlyPolicy({
      files: [
        {
          path: "desktop/src/renderer/index.html",
          text: '<script src="https://analytics.example/tag.js"></script>',
        },
        {
          path: "desktop/src/renderer/renderer.css",
          text: ".panel { background-image: url(//cdn.example/pixel.png); }",
        },
      ],
      dependencies: { "@daybreak/core": "*" },
    });

    expect(result.pass).toBe(false);
    expect(renderLocalOnlyReport(result)).toContain("remote URL");
  });
});
