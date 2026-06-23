import { describe, expect, it } from "vitest";

import {
  PREVIEW_URL,
  PRODUCTION_HTTP_URL,
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

function fetchErrorWithCause(message: string, cause: { code: string; message: string }) {
  return async () => {
    throw new Error(message, { cause });
  };
}

function defaultRouteResponse(url: string) {
  if (
    !url.startsWith("https://daybreak.rest/") &&
    !url.startsWith("http://daybreak.rest/") &&
    !url.startsWith("https://www.daybreak.rest/") &&
    !url.startsWith("http://www.daybreak.rest/") &&
    !url.startsWith("https://imperator-clawdius.github.io/daybreak/")
  ) {
    return undefined;
  }

  return {
    status: 200,
    body: url.endsWith("/robots.txt")
      ? validRobots()
      : url.endsWith("/sitemap.xml")
        ? validSitemap()
        : url.endsWith("/manifest.webmanifest")
          ? validManifest()
          : "Daybreak",
  };
}

function fetchByUrl(responses: Record<string, { status: number; body: string }>) {
  return async (url: string) => {
    const response = responses[url] ?? defaultRouteResponse(url);
    if (!response) throw new Error(`unexpected fetch ${url}`);
    return {
      ok: response.status >= 200 && response.status < 300,
      status: response.status,
      text: async () => response.body,
    };
  };
}

function validRobots() {
  return "User-Agent: *\nAllow: /\n\nSitemap: https://daybreak.rest/sitemap.xml\n";
}

function validSitemap() {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<urlset>",
    "<loc>https://daybreak.rest/</loc>",
    "<loc>https://daybreak.rest/privacy/</loc>",
    "<loc>https://daybreak.rest/terms/</loc>",
    "</urlset>",
  ].join("\n");
}

function validManifest() {
  return JSON.stringify({
    name: "Daybreak",
    short_name: "Daybreak",
    start_url: "https://daybreak.rest",
    scope: "https://daybreak.rest/",
    display: "standalone",
    background_color: "#0b1020",
    theme_color: "#0b1020",
    icons: [
      {
        src: "https://daybreak.rest/daybreak-app.png",
        sizes: "1252x878",
        type: "image/png",
        purpose: "any",
      },
    ],
  });
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
      fetchImpl: async (url: string) => {
        if (url.endsWith("/robots.txt")) {
          return { ok: true, status: 200, text: async () => validRobots() };
        }
        if (url.endsWith("/sitemap.xml")) {
          return { ok: true, status: 200, text: async () => validSitemap() };
        }
        if (url.endsWith("/manifest.webmanifest")) {
          return { ok: true, status: 200, text: async () => validManifest() };
        }
        return { ok: true, status: 200, text: async () => "Daybreak" };
      },
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

  it("includes the underlying TLS cause when HTTPS certificate verification fails", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchErrorWithCause("fetch failed", {
        code: "ERR_TLS_CERT_ALTNAME_INVALID",
        message: "Hostname/IP does not match certificate's altnames",
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain(
      "error=fetch failed cause=ERR_TLS_CERT_ALTNAME_INVALID: Hostname/IP does not match certificate's altnames",
    );
  });

  it("reports the GitHub Pages preview even when production HTTPS is pending", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchByUrl({
        [PRODUCTION_URL]: { status: 495, body: "certificate pending" },
        [PRODUCTION_HTTP_URL]: { status: 200, body: "Daybreak over HTTP" },
        [PREVIEW_URL]: { status: 200, body: "Daybreak preview" },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain("LIVE_SITE=FAIL status=495");
    expect(report.text).toContain(
      "PREVIEW_SITE=pass status=200 contains_daybreak=true",
    );
    expect(report.text).toContain(
      "APEX_HTTP_SITE=pass status=200 contains_daybreak=true",
    );
  });

  it("does not count a preview redirect to the apex as preview health", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: async (url: string, init?: { redirect?: string }) => {
        const isPreview = url.startsWith(PREVIEW_URL);
        if (isPreview && init?.redirect === "manual") {
          return { ok: false, status: 301, text: async () => "Moved" };
        }
        if (isPreview) {
          return { ok: true, status: 200, text: async () => "Daybreak apex" };
        }
        if (url.endsWith("/robots.txt")) {
          return { ok: true, status: 200, text: async () => validRobots() };
        }
        if (url.endsWith("/sitemap.xml")) {
          return { ok: true, status: 200, text: async () => validSitemap() };
        }
        if (url.endsWith("/manifest.webmanifest")) {
          return { ok: true, status: 200, text: async () => validManifest() };
        }
        return { ok: true, status: 200, text: async () => "Daybreak" };
      },
    });

    expect(report.text).toContain(
      "PREVIEW_SITE=pending status=301 contains_daybreak=false",
    );
  });

  it("keeps launch pending when a required legal route is missing", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchByUrl({
        [PRODUCTION_URL]: { status: 200, body: "Daybreak" },
        "https://daybreak.rest/privacy/": {
          status: 200,
          body: "Privacy - Daybreak",
        },
        "https://daybreak.rest/terms/": { status: 404, body: "Not found" },
        [PRODUCTION_HTTP_URL]: { status: 200, body: "Daybreak over HTTP" },
        "http://daybreak.rest/privacy/": {
          status: 200,
          body: "Privacy - Daybreak",
        },
        "http://daybreak.rest/terms/": {
          status: 200,
          body: "Terms - Daybreak",
        },
        [PREVIEW_URL]: { status: 200, body: "Daybreak preview" },
        "https://imperator-clawdius.github.io/daybreak/privacy/": {
          status: 200,
          body: "Privacy - Daybreak",
        },
        "https://imperator-clawdius.github.io/daybreak/terms/": {
          status: 200,
          body: "Terms - Daybreak",
        },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain(
      "APEX_ROUTES=pending privacy=pass(200) terms=pending(404)",
    );
  });

  it("keeps launch pending when crawler metadata routes are missing", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchByUrl({
        [PRODUCTION_URL]: { status: 200, body: "Daybreak" },
        "https://daybreak.rest/privacy/": {
          status: 200,
          body: "Privacy - Daybreak",
        },
        "https://daybreak.rest/terms/": { status: 200, body: "Terms - Daybreak" },
        "https://daybreak.rest/robots.txt": {
          status: 200,
          body: validRobots(),
        },
        "https://daybreak.rest/sitemap.xml": { status: 404, body: "Not found" },
        [PRODUCTION_HTTP_URL]: { status: 200, body: "Daybreak over HTTP" },
        "http://daybreak.rest/privacy/": {
          status: 200,
          body: "Privacy - Daybreak",
        },
        "http://daybreak.rest/terms/": { status: 200, body: "Terms - Daybreak" },
        "http://daybreak.rest/robots.txt": {
          status: 200,
          body: validRobots(),
        },
        "http://daybreak.rest/sitemap.xml": {
          status: 200,
          body: validSitemap(),
        },
        [PREVIEW_URL]: { status: 200, body: "Daybreak preview" },
        "https://imperator-clawdius.github.io/daybreak/privacy/": {
          status: 200,
          body: "Privacy - Daybreak",
        },
        "https://imperator-clawdius.github.io/daybreak/terms/": {
          status: 200,
          body: "Terms - Daybreak",
        },
        "https://imperator-clawdius.github.io/daybreak/robots.txt": {
          status: 200,
          body: validRobots(),
        },
        "https://imperator-clawdius.github.io/daybreak/sitemap.xml": {
          status: 200,
          body: validSitemap(),
        },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain(
      "APEX_ROUTES=pending privacy=pass(200) terms=pass(200) robots.txt=pass(200) sitemap.xml=pending(404)",
    );
  });

  it("keeps launch pending when the production manifest is malformed", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchByUrl({
        "https://daybreak.rest/manifest.webmanifest": {
          status: 200,
          body: "{\"name\":\"Daybreak\"}",
        },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain(
      "APEX_ROUTES=pending privacy=pass(200) terms=pass(200) robots.txt=pass(200) sitemap.xml=pass(200) manifest.webmanifest=pending(200)",
    );
  });

  it("reports www DNS and HTTPS status alongside the apex", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchByUrl({
        [PRODUCTION_URL]: { status: 200, body: "Daybreak" },
        "https://daybreak.rest/privacy/": {
          status: 200,
          body: "Privacy - Daybreak",
        },
        "https://daybreak.rest/terms/": { status: 200, body: "Terms - Daybreak" },
        "https://daybreak.rest/robots.txt": {
          status: 200,
          body: validRobots(),
        },
        "https://daybreak.rest/sitemap.xml": {
          status: 200,
          body: validSitemap(),
        },
        "https://www.daybreak.rest/": {
          status: 495,
          body: "certificate pending",
        },
        [PRODUCTION_HTTP_URL]: { status: 200, body: "Daybreak over HTTP" },
        [PREVIEW_URL]: { status: 200, body: "Daybreak preview" },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain(
      "WWW_DNS host=www.daybreak.rest resolves=185.199.108.153",
    );
    expect(report.text).toContain(
      "WWW_HTTP_SITE=pass status=200 contains_daybreak=true",
    );
    expect(report.text).toContain(
      "WWW_SITE=pending status=495 contains_daybreak=false",
    );
  });

  it("checks required routes on the www host", async () => {
    const report = await verifyLaunch({
      argv: ["node", "scripts/verify-launch.mjs"],
      lookupImpl: async () => ["185.199.108.153"],
      fetchImpl: fetchByUrl({
        [PRODUCTION_URL]: { status: 200, body: "Daybreak" },
        "https://daybreak.rest/privacy/": {
          status: 200,
          body: "Privacy - Daybreak",
        },
        "https://daybreak.rest/terms/": { status: 200, body: "Terms - Daybreak" },
        "https://daybreak.rest/robots.txt": {
          status: 200,
          body: validRobots(),
        },
        "https://daybreak.rest/sitemap.xml": {
          status: 200,
          body: validSitemap(),
        },
        "https://www.daybreak.rest/": {
          status: 495,
          body: "certificate pending",
        },
        "https://www.daybreak.rest/privacy/": {
          status: 495,
          body: "certificate pending",
        },
        "https://www.daybreak.rest/terms/": {
          status: 495,
          body: "certificate pending",
        },
        "https://www.daybreak.rest/robots.txt": {
          status: 495,
          body: "certificate pending",
        },
        "https://www.daybreak.rest/sitemap.xml": {
          status: 495,
          body: "certificate pending",
        },
        [PRODUCTION_HTTP_URL]: { status: 200, body: "Daybreak over HTTP" },
        [PREVIEW_URL]: { status: 200, body: "Daybreak preview" },
      }),
    });

    expect(report.ok).toBe(false);
    expect(report.text).toContain(
      "WWW_HTTP_ROUTES=pass privacy=pass(200) terms=pass(200) robots.txt=pass(200) sitemap.xml=pass(200)",
    );
    expect(report.text).toContain(
      "WWW_ROUTES=pending privacy=pending(495) terms=pending(495) robots.txt=pending(495) sitemap.xml=pending(495)",
    );
  });
});
