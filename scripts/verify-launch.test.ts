import { describe, expect, it } from "vitest";

import {
  PREVIEW_URL,
  getPrimaryUrl,
  verifyLaunch,
} from "./launch-core.mjs";
import { PRODUCTION_URL } from "./readiness-core.mjs";

function fetchPage(status: number, body: string) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  });
}

function fetchError(message: string) {
  return async () => {
    throw new Error(message);
  };
}

function fetchByUrl(responses: Record<string, { status: number; body: string }>) {
  return async (url: string) => {
    const response = responses[url];
    if (!response) throw new Error(`unexpected fetch ${url}`);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => response.body,
    };
  };
}

describe("launch verifier", () => {
  it("uses the production apex as the default primary URL", () => {
    expect(getPrimaryUrl(["node", "scripts/verify-launch.mjs"])).toBe(
      PRODUCTION_URL,
    );
  });

  it("allows an explicit preview URL override", () => {
    expect(
      getPrimaryUrl(["node", "scripts/verify-launch.mjs", PREVIEW_URL]),
    ).toBe(PREVIEW_URL);
  });

  it("reports apex pass only when DNS resolves and the site returns Daybreak", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchPage(200, "Daybreak"),
    });

    expect(report.ok).toBe(true);
    expect(report.text).toContain(`PRIMARY ${PRODUCTION_URL}`);
    expect(report.text).toContain("LIVE_SITE=pass status=200");
    expect(report.text).toContain("APEX_SITE=pass status=200");
  });

  it("reports apex HTTPS fetch errors instead of hiding the reason", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchError("certificate pending"),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain("LIVE_SITE=FAIL status=0");
    expect(report.text).toContain(
      "APEX_SITE=pending status=0 error=certificate pending",
    );
  });

  it("reports the GitHub Pages preview even when production HTTPS is pending", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchByUrl({
        [PRODUCTION_URL]: { status: 495, body: "certificate pending" },
        [PREVIEW_URL]: { status: 200, body: "Daybreak preview" },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain("LIVE_SITE=FAIL status=495");
    expect(report.text).toContain(
      "PREVIEW_SITE=pass status=200 contains_daybreak=true",
    );
  });
});
