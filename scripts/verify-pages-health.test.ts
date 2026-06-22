import { describe, expect, it } from "vitest";

import {
  evaluatePagesHealth,
  fetchPagesHealth,
  renderPagesHealthReport,
} from "./pages-health-core.mjs";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function healthyHost(host: string) {
  return {
    host,
    dns_resolves: true,
    is_valid: true,
    is_served_by_pages: true,
    responds_to_https: true,
    enforces_https: true,
    is_https_eligible: true,
    caa_error: null,
    https_error: null,
  };
}

describe("GitHub Pages health verifier", () => {
  it("polls while GitHub prepares the DNS health result", async () => {
    const waits: number[] = [];
    const responses = [
      jsonResponse(202, {}),
      jsonResponse(200, {
        domain: healthyHost("daybreak.rest"),
        alt_domain: healthyHost("www.daybreak.rest"),
      }),
    ];

    const result = await fetchPagesHealth({
      fetchImpl: async () => responses.shift(),
      waitImpl: async (ms: number) => {
        waits.push(ms);
      },
      delayMs: 25,
      maxAttempts: 2,
    });

    expect(waits).toEqual([25]);
    expect(result).toMatchObject({ ok: true, status: 200 });
  });

  it("sends GitHub bearer auth when a token is supplied", async () => {
    let authorization = "";

    await fetchPagesHealth({
      token: "gh_test_token",
      fetchImpl: async (_url: string, init?: { headers?: Record<string, string> }) => {
        authorization = init?.headers?.authorization ?? "";
        return jsonResponse(200, {
          domain: healthyHost("daybreak.rest"),
          alt_domain: healthyHost("www.daybreak.rest"),
        });
      },
    });

    expect(authorization).toBe("Bearer gh_test_token");
  });

  it("keeps Pages health pending until apex and www HTTPS are enforced", () => {
    const evaluation = evaluatePagesHealth({
      config: {
        cname: "daybreak.rest",
        https_certificate: null,
        https_enforced: false,
      },
      health: {
        domain: {
          ...healthyHost("daybreak.rest"),
          responds_to_https: false,
          enforces_https: false,
          https_error: "peer_failed_verification",
        },
        alt_domain: {
          ...healthyHost("www.daybreak.rest"),
          responds_to_https: false,
          enforces_https: false,
          https_error: "peer_failed_verification",
        },
      },
    });

    expect(evaluation.pass).toBe(false);
    expect(renderPagesHealthReport(evaluation)).toContain(
      "PAGES_HEALTH=pending",
    );
    expect(renderPagesHealthReport(evaluation)).toContain(
      "PAGES_CERTIFICATE=missing",
    );
    expect(renderPagesHealthReport(evaluation)).toContain(
      "PAGES_DOMAIN host=daybreak.rest",
    );
    expect(renderPagesHealthReport(evaluation)).toContain(
      "PAGES_ALT_DOMAIN host=www.daybreak.rest",
    );
  });

  it("passes only when the Pages certificate and both hosts are HTTPS-ready", () => {
    const evaluation = evaluatePagesHealth({
      config: {
        cname: "daybreak.rest",
        https_certificate: {
          state: "approved",
          description: "Certificate is approved",
          domains: ["daybreak.rest", "www.daybreak.rest"],
        },
        https_enforced: true,
      },
      health: {
        domain: healthyHost("daybreak.rest"),
        alt_domain: healthyHost("www.daybreak.rest"),
      },
    });

    expect(evaluation.pass).toBe(true);
    expect(renderPagesHealthReport(evaluation)).toContain("PAGES_HEALTH=ready");
  });
});
