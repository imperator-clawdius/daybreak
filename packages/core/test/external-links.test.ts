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

  it("rejects checkout proof with extra line items", () => {
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
              {
                quantity: 1,
                price: {
                  unit_amount: 500,
                  currency: "usd",
                  recurring: null,
                },
              },
            ],
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_extra_line_items",
    });
  });

  it("rejects checkout proof with no line items", () => {
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
            data: [],
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects malformed checkout Payment Link state proof", () => {
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

    for (const payment_link of [
      { ...baseProof.payment_link, active: "true" },
      { ...baseProof.payment_link, livemode: "true" },
    ]) {
      expect(
        getCheckoutProofState({
          checkoutUrl: "https://buy.stripe.com/live_123",
          expectedPriceUsd: 19,
          proof: {
            ...baseProof,
            payment_link,
          },
        }),
      ).toMatchObject({
        ready: false,
        reason: "checkout_proof_malformed",
      });
    }
  });

  it("rejects malformed checkout line item proof without throwing", () => {
    expect(() =>
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
            data: { quantity: 1 },
          },
        },
      }),
    ).not.toThrow();

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
            data: { quantity: 1 },
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects malformed checkout line item entries without throwing", () => {
    expect(() =>
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
            data: [null],
          },
        },
      }),
    ).not.toThrow();

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
            data: [null],
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout line items with missing price proof without throwing", () => {
    expect(() =>
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
            data: [{ quantity: 1 }],
          },
        },
      }),
    ).not.toThrow();

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
            data: [{ quantity: 1 }],
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout line items with malformed quantity proof", () => {
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
                quantity: "1",
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
    ).toMatchObject({
      ready: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout line items with malformed price fields", () => {
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
                  unit_amount: "1900",
                  currency: "usd",
                  recurring: null,
                },
              },
            ],
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_line_items_invalid",
    });

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
                  currency: 1900,
                  recurring: null,
                },
              },
            ],
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_line_items_invalid",
    });

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
                  recurring: false,
                },
              },
            ],
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout proof that contains keys or customer data", () => {
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
          request: {
            api_key: "sk_live_secret",
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_proof_contains_sensitive_data",
    });
  });

  it("rejects checkout proof with auth header or camel-case secret key variants", () => {
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
          headers: {
            Authorization: "Bearer sk_live_secret",
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_proof_contains_sensitive_data",
    });

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
          apiKey: "sk_live_secret",
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_proof_contains_sensitive_data",
    });
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

  it("rejects malformed installer proof fields", () => {
    const url = "https://downloads.example.com/daybreak.exe";
    const sha256 =
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";
    const baseProof = {
      download: { url, sha256 },
      signature: {
        status: "Valid",
        signer: "CN=Passive Print Labs LLC",
      },
    };

    for (const proof of [
      { ...baseProof, download: { ...baseProof.download, sha256: 123 } },
      {
        ...baseProof,
        signature: { ...baseProof.signature, status: true },
      },
      {
        ...baseProof,
        signature: { ...baseProof.signature, signer: 123 },
      },
    ]) {
      expect(
        getVerifiedInstallerLinkState({
          url,
          sha256,
          proof,
        }),
      ).toMatchObject({
        ready: false,
        reason: "installer_proof_malformed",
      });
    }
  });

  it("rejects installer proof that contains signing secrets or request logs", () => {
    const url = "https://downloads.example.com/daybreak.exe";
    const sha256 =
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

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
          signing: {
            certificate_private_key: "-----BEGIN PRIVATE KEY-----",
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "installer_proof_contains_sensitive_data",
    });
  });

  it("rejects installer proof with auth header or secret key variants", () => {
    const url = "https://downloads.example.com/daybreak.exe";
    const sha256 =
      "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

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
          response_headers: {
            "Set-Cookie": "session=secret",
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "installer_proof_contains_sensitive_data",
    });

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
          stripe_secret_key: "sk_live_secret",
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "installer_proof_contains_sensitive_data",
    });
  });
});
