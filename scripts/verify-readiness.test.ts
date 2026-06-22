import { describe, expect, it } from "vitest";
import {
  evaluateExternalLink,
  extractConfigUrl,
} from "./readiness-core.mjs";

function fetchStatus(status: number) {
  return async () => ({ ok: status >= 200 && status < 300, status });
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
        fetchImpl: fetchStatus(404),
      }),
    ).resolves.toMatchObject({ pass: false, reason: "http_not_ok", status: 404 });
  });
});
