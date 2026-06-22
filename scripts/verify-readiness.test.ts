import { describe, expect, it } from "vitest";
import {
  evaluateProductionDomain,
  evaluateExternalLink,
  extractConfigUrl,
} from "./readiness-core.mjs";

function fetchStatus(status: number) {
  return async () => ({ ok: status >= 200 && status < 300, status });
}

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

function fetchBody(status: number, body: string) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  });
}

describe("readiness external-link proof", () => {
  it("extracts configured URLs from the site config source", () => {
    const src = 'export const CHECKOUT_URL = "https://buy.stripe.com/live";';

    expect(extractConfigUrl(src, "CHECKOUT_URL")).toBe(
      "https://buy.stripe.com/live",
    );
  });

  it("keeps checkout pending for placeholders", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "PENDING_STRIPE_PAYMENT_LINK",
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({ pass: false, reason: "not_configured" });
  });

  it("keeps checkout pending for non-Stripe HTTPS URLs", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://example.com/pay",
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({ pass: false, reason: "not_stripe_payment_link" });
  });

  it("passes checkout only when a Stripe Payment Link returns a 2xx response", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({ pass: true, status: 200 });
  });

  it("keeps installer download pending when the URL does not return 2xx", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchStatus(404),
      }),
    ).resolves.toMatchObject({ pass: false, reason: "http_not_ok", status: 404 });
  });

  it("keeps installer download pending until a SHA-256 checksum is configured", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256: "PENDING_INSTALLER_SHA256",
        fetchImpl: fetchBody(200, "hello"),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checksum_not_configured",
    });
  });

  it("rejects installer downloads whose bytes do not match the configured checksum", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "0000000000000000000000000000000000000000000000000000000000000000",
        fetchImpl: fetchBody(200, "hello"),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checksum_mismatch",
    });
  });

  it("passes installer download only when the fetched bytes match the configured checksum", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
      }),
    ).resolves.toMatchObject({
      pass: true,
      status: 200,
      sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    });
  });

  it("keeps production domain pending when DNS is unresolved", async () => {
    await expect(
      evaluateProductionDomain({
        host: "daybreak.rest",
        url: "https://daybreak.rest/",
        lookupImpl: async () => [],
        fetchImpl: fetchPage(200, "Daybreak"),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "dns_unresolved",
    });
  });

  it("keeps production domain pending until all GitHub Pages A records are present", async () => {
    await expect(
      evaluateProductionDomain({
        host: "daybreak.rest",
        url: "https://daybreak.rest/",
        lookupImpl: async () => ["185.199.108.153"],
        fetchImpl: fetchPage(200, "Daybreak"),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "dns_missing_github_pages_records",
    });
  });

  it("passes production domain when DNS points at GitHub Pages and the apex serves Daybreak", async () => {
    await expect(
      evaluateProductionDomain({
        host: "daybreak.rest",
        url: "https://daybreak.rest/",
        lookupImpl: async () => [
          "185.199.108.153",
          "185.199.109.153",
          "185.199.110.153",
          "185.199.111.153",
        ],
        fetchImpl: fetchPage(200, "Daybreak"),
      }),
    ).resolves.toMatchObject({
      pass: true,
      detail:
        "DNS A records resolved to GitHub Pages and apex returned HTTP 200",
    });
  });

  it("keeps the production domain pending with the HTTPS fetch error visible", async () => {
    await expect(
      evaluateProductionDomain({
        host: "daybreak.rest",
        url: "https://daybreak.rest/",
        lookupImpl: async () => [
          "185.199.108.153",
          "185.199.109.153",
          "185.199.110.153",
          "185.199.111.153",
        ],
        fetchImpl: fetchError("certificate pending"),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "apex_https_not_ready",
      detail: "HTTPS error contains_daybreak=false error=certificate pending",
    });
  });
});
