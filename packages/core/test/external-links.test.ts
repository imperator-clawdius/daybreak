import { describe, expect, it } from "vitest";

import {
  getCheckoutProofState,
  getCheckoutLinkState,
  getVerifiedCheckoutLinkState,
  getInstallerLinkState,
  getVerifiedInstallerLinkState,
  isLiveCheckoutUrl,
} from "../src/external-links";

describe("external launch links", () => {
  it("keeps checkout inactive for placeholders and non-Stripe URLs", () => {
    expect(isLiveCheckoutUrl("PENDING_STRIPE_PAYMENT_LINK")).toBe(false);
    expect(isLiveCheckoutUrl("https://example.com/pay")).toBe(false);
  });

  it("activates checkout only for Stripe Payment Links", () => {
    expect(isLiveCheckoutUrl("https://buy.stripe.com/live_123")).toBe(true);
  });

  it("explains why checkout is not live", () => {
    expect(getCheckoutLinkState("PENDING_STRIPE_PAYMENT_LINK")).toMatchObject({
      ready: false,
      reason: "not_configured",
    });
    expect(getCheckoutLinkState("https://example.com/pay")).toMatchObject({
      ready: false,
      reason: "not_stripe_payment_link",
    });
  });

  it("accepts only a live active one-time USD $19 Stripe proof for the checkout URL", () => {
    expect(
      getCheckoutProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          payment_link: {
            url: "https://buy.stripe.com/live_123",
            active: true,
            livemode: true,
          },
          line_items: {
            data: [
              {
                quantity: 1,
                price: {
                  unit_amount: 1900,
                  currency: "usd",
                  recurring: null,
                },
              },
            ],
          },
        },
      }),
    ).toMatchObject({ ready: true, reason: "ready" });
  });

  it("keeps the public checkout CTA inactive until Stripe proof matches the configured link", () => {
    const checkoutUrl = "https://buy.stripe.com/live_123";

    expect(
      getVerifiedCheckoutLinkState({
        checkoutUrl,
        expectedPriceUsd: 19,
        proof: null,
      }),
    ).toMatchObject({ ready: false, reason: "checkout_proof_missing" });

    expect(
      getVerifiedCheckoutLinkState({
        checkoutUrl,
        expectedPriceUsd: 19,
        proof: {
          payment_link: {
            url: checkoutUrl,
            active: true,
            livemode: true,
          },
          line_items: {
            data: [
              {
                quantity: 1,
                price: {
                  unit_amount: 1900,
                  currency: "usd",
                  recurring: null,
                },
              },
            ],
          },
        },
      }),
    ).toMatchObject({ ready: true, reason: "ready" });
  });

  it("rejects checkout proof that does not prove the configured $19 live one-time link", () => {
    const baseProof = {
      payment_link: {
        url: "https://buy.stripe.com/live_123",
        active: true,
        livemode: true,
      },
      line_items: {
        data: [
          {
            quantity: 1,
            price: {
              unit_amount: 1900,
              currency: "usd",
              recurring: null,
            },
          },
        ],
      },
    };

    expect(
      getCheckoutProofState({
        checkoutUrl: "https://buy.stripe.com/other",
        expectedPriceUsd: 19,
        proof: baseProof,
      }),
    ).toMatchObject({ ready: false, reason: "checkout_url_mismatch" });

    expect(
      getCheckoutProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...baseProof,
          payment_link: { ...baseProof.payment_link, livemode: false },
        },
      }),
    ).toMatchObject({ ready: false, reason: "checkout_not_live_mode" });

    expect(
      getCheckoutProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...baseProof,
          line_items: {
            data: [
              {
                quantity: 1,
                price: {
                  unit_amount: 2000,
                  currency: "usd",
                  recurring: null,
                },
              },
            ],
          },
        },
      }),
    ).toMatchObject({ ready: false, reason: "checkout_price_mismatch" });

    expect(
      getCheckoutProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...baseProof,
          line_items: {
            data: [
              {
                quantity: 1,
                price: {
                  unit_amount: 1900,
                  currency: "usd",
                  recurring: { interval: "month" },
                },
              },
            ],
          },
        },
      }),
    ).toMatchObject({ ready: false, reason: "checkout_not_one_time" });
  });

  it("keeps installer download inactive until both URL and checksum are real", () => {
    expect(
      getInstallerLinkState({
        url: "PENDING_INSTALLER_DOWNLOAD",
        sha256: "PENDING_INSTALLER_SHA256",
      }),
    ).toMatchObject({ ready: false, reason: "url_not_configured" });

    expect(
      getInstallerLinkState({
        url: "https://downloads.example.com/daybreak.exe",
        sha256: "PENDING_INSTALLER_SHA256",
      }),
    ).toMatchObject({ ready: false, reason: "checksum_not_configured" });
  });

  it("activates installer download only when URL is HTTPS and checksum is SHA-256", () => {
    expect(
      getInstallerLinkState({
        url: "https://downloads.example.com/daybreak.exe",
        sha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
      }),
    ).toMatchObject({ ready: true, reason: "ready" });
  });

  it("keeps the public download CTA inactive until signed installer proof matches", () => {
    const url = "https://downloads.example.com/daybreak.exe";
    const sha256 =
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

    expect(
      getVerifiedInstallerLinkState({
        url,
        sha256,
        proof: null,
      }),
    ).toMatchObject({ ready: false, reason: "installer_proof_missing" });

    expect(
      getVerifiedInstallerLinkState({
        url,
        sha256,
        proof: {
          download: { url, sha256 },
          signature: {
            status: "Valid",
            signer: "CN=Passive Print Labs LLC",
          },
        },
      }),
    ).toMatchObject({ ready: true, reason: "ready" });
  });
});
