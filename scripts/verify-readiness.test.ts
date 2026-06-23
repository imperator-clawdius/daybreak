import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReadinessGates,
  evaluateMarketSignal,
  evaluateProductionDomain,
  evaluateExternalLink,
  extractConfigUrl,
  renderReadinessReport,
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

function fetchErrorWithCause(message: string, cause: { code: string; message: string }) {
  return async () => {
    throw new Error(message, { cause });
  };
}

function fetchBody(status: number, body: string) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => new TextEncoder().encode(body).buffer,
  });
}

function signature(status: string, subject = "", timestamped = true) {
  return async () => ({ status, statusMessage: "", subject, timestamped });
}

function stripeProof({
  url = "https://buy.stripe.com/live_123",
  id = "plink_live_123",
  unitAmount = 1900,
  recurring = null,
  livemode = true,
  active = true,
  quantity = 1,
} = {}) {
  return {
    payment_link: { id, url, active, livemode },
    line_items: {
      data: [
        {
          quantity,
          price: {
            unit_amount: unitAmount,
            currency: "usd",
            recurring,
          },
        },
      ],
    },
  };
}

function paidOrderProof(overrides = {}) {
  return {
    checkout_session: {
      id: "cs_live_123",
      livemode: true,
      mode: "payment",
      status: "complete",
      payment_status: "paid",
      amount_total: 1900,
      currency: "usd",
      payment_link: "plink_live_123",
    },
    payment_link: {
      id: "plink_live_123",
      url: "https://buy.stripe.com/live_123",
    },
    refunds: { data: [], has_more: false },
    ...overrides,
  };
}

function installerProof({
  url = "https://downloads.example.com/daybreak.exe",
  sha256 = "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
  status = "Valid",
  signer = "CN=Passive Print Labs LLC",
  timestamped = true,
} = {}) {
  return {
    download: { url, sha256 },
    signature: { status, signer, timestamped },
  };
}

function makeReadinessRoot() {
  const root = mkdtempSync(join(tmpdir(), "daybreak-readiness-test-"));
  const files = [
    ["packages/core/dist/index.js", ""],
    ["desktop/dist/main.js", ""],
    ["desktop/dist/renderer.js", ""],
    ["site/out/index.html", "<html>Daybreak</html>"],
    [
      "site/app/config.ts",
      [
        'export const CHECKOUT_URL = "PENDING_STRIPE_PAYMENT_LINK";',
        'export const DOWNLOAD_URL = "PENDING_INSTALLER_DOWNLOAD";',
        'export const DOWNLOAD_SHA256 = "PENDING_INSTALLER_SHA256";',
        "export const PRICE_USD = 19;",
      ].join("\n"),
    ],
  ];

  for (const [relativePath, contents] of files) {
    const fullPath = join(root, relativePath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, contents);
  }

  return root;
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

  it("keeps market signal pending without real paid-order proof", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: null,
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_missing",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending when top-level paid-order proof is malformed", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: [],
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("passes market signal only with unrefunded live paid-order proof", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof(),
      }),
    ).toMatchObject({
      pass: true,
      reason: "ready",
      paidOrders: 1,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          refunds: { data: [{ id: "re_live_123" }], has_more: false },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_refunded",
      paidOrders: 1,
      refunds: 1,
    });
  });

  it("keeps market signal pending until refund proof explicitly shows no refunds", () => {
    const { refunds: _refunds, ...missingRefunds } = paidOrderProof();

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: missingRefunds,
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_refund_proof_missing",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: { data: "not-an-array" } }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_refund_proof_missing",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending until refund pagination proof is complete", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: { data: [] } }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_refund_proof_incomplete",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: { data: [], has_more: true } }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_refund_proof_incomplete",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending when first-order refund pagination proof is malformed", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: { data: [], has_more: "false" } }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: { data: [], has_more: 0 } }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending when first-order refund proof container is malformed", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: "not-an-object" }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: [] }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending when first-order refund proof entries are malformed", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: { data: ["not-an-object"] } }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: { data: [[]] } }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending when first-order amount or currency proof is malformed", () => {
    const base = paidOrderProof();

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          checkout_session: {
            ...base.checkout_session,
            amount_total: "1900",
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          payment_link: {
            ...base.payment_link,
            url: 123,
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          checkout_session: {
            ...base.checkout_session,
            amount_total: 1900.5,
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          checkout_session: {
            ...base.checkout_session,
            currency: 1900,
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending when first-order payment link id proof is malformed", () => {
    const base = paidOrderProof();

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          checkout_session: {
            ...base.checkout_session,
            payment_link: "",
          },
          payment_link: {
            ...base.payment_link,
            id: "",
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          checkout_session: {
            ...base.checkout_session,
            payment_link: 123,
          },
          payment_link: {
            ...base.payment_link,
            id: 123,
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          payment_link: "not-an-object",
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending when first-order status proof is malformed", () => {
    const base = paidOrderProof();

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          checkout_session: {
            ...base.checkout_session,
            id: "",
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_malformed",
      paidOrders: 0,
      refunds: 0,
    });

    for (const checkout_session of [
      { ...base.checkout_session, id: 123 },
      { ...base.checkout_session, livemode: "true" },
      { ...base.checkout_session, mode: 123 },
      { ...base.checkout_session, status: true },
      { ...base.checkout_session, payment_status: true },
    ]) {
      expect(
        evaluateMarketSignal({
          checkoutUrl: "https://buy.stripe.com/live_123",
          expectedPriceUsd: 19,
          proof: paidOrderProof({ checkout_session }),
        }),
      ).toMatchObject({
        pass: false,
        reason: "paid_order_proof_malformed",
        paidOrders: 0,
        refunds: 0,
      });
    }
  });

  it("keeps market signal pending when paid-order proof contains customer personal data", () => {
    const base = paidOrderProof();

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          checkout_session: {
            ...base.checkout_session,
            customer_details: {
              email: "buyer@example.com",
              name: "Buyer",
            },
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });
  });

  it("keeps market signal pending for sensitive proof before other proof mismatches", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          audit: {
            request: {
              headers: {
                authorization: "Bearer sk_live_secret",
              },
            },
          },
        },
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("keeps market signal pending when paid-order proof contains request logs or private material", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          audit: {
            request: {
              headers: {
                authorization: "Bearer sk_live_secret",
              },
            },
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          signing: {
            private_key: "-----BEGIN PRIVATE KEY-----",
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });
  });

  it("keeps market signal pending when paid-order proof contains auth header or secret key variants", () => {
    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          headers: {
            Authorization: "Bearer sk_live_secret",
          },
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });

    expect(
      evaluateMarketSignal({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          apiKey: "sk_live_secret",
        }),
      }),
    ).toMatchObject({
      pass: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });
  });

  it("keeps checkout pending until Stripe proof shows the configured $19 live one-time link", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_missing",
    });
  });

  it("rejects checkout proof for the wrong price", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: stripeProof({ unitAmount: 2000 }),
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_price_mismatch",
    });
  });

  it("rejects checkout proof with extra line items", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
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
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_extra_line_items",
    });
  });

  it("rejects checkout proof with incomplete line item pagination", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          payment_link: {
            url: "https://buy.stripe.com/live_123",
            active: true,
            livemode: true,
          },
          line_items: {
            has_more: true,
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
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_incomplete",
    });
  });

  it("rejects malformed checkout line item pagination proof", async () => {
    const baseProof = stripeProof();

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          ...baseProof,
          line_items: { ...baseProof.line_items, has_more: "false" },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_malformed",
    });

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          ...baseProof,
          line_items: { ...baseProof.line_items, has_more: 0 },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_malformed",
    });
  });

  it("rejects checkout proof with no line items", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          payment_link: {
            url: "https://buy.stripe.com/live_123",
            active: true,
            livemode: true,
          },
          line_items: {
            data: [],
          },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects malformed checkout line item containers", async () => {
    const baseProof = stripeProof();

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: { ...baseProof, line_items: "not-an-object" },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_malformed",
    });

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: { ...baseProof, line_items: [] },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_malformed",
    });
  });

  it("rejects malformed checkout Payment Link state proof", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          ...stripeProof(),
          payment_link: "not-an-object",
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_malformed",
    });

    for (const payment_link of [
      { ...stripeProof().payment_link, id: "" },
      { ...stripeProof().payment_link, id: 123 },
      { url: "https://buy.stripe.com/live_123", active: "true", livemode: true },
      { url: "https://buy.stripe.com/live_123", active: true, livemode: "true" },
    ]) {
      await expect(
        evaluateExternalLink({
          kind: "checkout",
          url: "https://buy.stripe.com/live_123",
          expectedPriceUsd: 19,
          checkoutProof: {
            ...stripeProof(),
            payment_link,
          },
          fetchImpl: fetchStatus(200),
        }),
      ).resolves.toMatchObject({
        pass: false,
        reason: "checkout_proof_malformed",
      });
    }
  });

  it("rejects malformed checkout Payment Link URL proof", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          ...stripeProof(),
          payment_link: {
            url: 123,
            active: true,
            livemode: true,
          },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_malformed",
    });

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          ...stripeProof(),
          payment_link: {
            active: true,
            livemode: true,
          },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_malformed",
    });
  });

  it("rejects malformed checkout line item proof without throwing", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          payment_link: {
            url: "https://buy.stripe.com/live_123",
            active: true,
            livemode: true,
          },
          line_items: {
            data: { quantity: 1 },
          },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects malformed checkout line item entries without throwing", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          payment_link: {
            url: "https://buy.stripe.com/live_123",
            active: true,
            livemode: true,
          },
          line_items: {
            data: [null],
          },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout line items with missing price proof without throwing", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          payment_link: {
            url: "https://buy.stripe.com/live_123",
            active: true,
            livemode: true,
          },
          line_items: {
            data: [{ quantity: 1 }],
          },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout line items with malformed quantity proof", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
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
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout line items with fractional quantity proof", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: stripeProof({ quantity: 1.5 }),
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout line items with malformed price fields", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
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
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: stripeProof({ unitAmount: 1900.5 }),
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
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
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
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
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_line_items_invalid",
    });
  });

  it("rejects checkout proof that contains keys or customer data", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          ...stripeProof(),
          request: {
            api_key: "sk_live_secret",
          },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_contains_sensitive_data",
    });
  });

  it("rejects checkout proof with auth header or camel-case secret key variants", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          ...stripeProof(),
          headers: {
            Authorization: "Bearer sk_live_secret",
          },
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_contains_sensitive_data",
    });

    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: {
          ...stripeProof(),
          apiKey: "sk_live_secret",
        },
        fetchImpl: fetchStatus(200),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "checkout_proof_contains_sensitive_data",
    });
  });

  it("passes checkout only when a Stripe Payment Link returns 2xx and proof matches the $19 link", async () => {
    await expect(
      evaluateExternalLink({
        kind: "checkout",
        url: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        checkoutProof: stripeProof(),
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

  it("keeps installer download pending when matching bytes are unsigned", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("NotSigned"),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "signature_not_valid",
    });
  });

  it("keeps installer download pending when matching bytes are signed by another publisher", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("Valid", "CN=Unrelated Publisher LLC"),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "signer_mismatch",
    });
  });

  it("keeps installer download pending when matching bytes are not timestamped", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("Valid", "CN=Passive Print Labs LLC", false),
        installerProof: installerProof(),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "signature_not_valid",
      signatureTimestamped: false,
    });
  });

  it("keeps installer download pending until signed-installer proof exists", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("Valid", "CN=Passive Print Labs LLC"),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "installer_proof_missing",
    });
  });

  it("tells operators that installer readiness requires timestamping", async () => {
    const root = makeReadinessRoot();
    try {
      const gates = await buildReadinessGates({
        root,
        lookupImpl: async () => [],
        fetchImpl: fetchStatus(404),
      });
      const report = renderReadinessReport(gates);

      expect(report.text).toContain(
        "produce a signed and timestamped Windows installer",
      );
      expect(report.text).toContain(
        "timestamped Passive Print Labs Authenticode signer",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects malformed installer proof fields", async () => {
    for (const installerProofData of [
      { ...installerProof(), download: "not-an-object" },
      { ...installerProof(), signature: "not-an-object" },
      installerProof({ sha256: 123 }),
      installerProof({ status: true }),
      installerProof({ signer: 123 }),
      {
        ...installerProof(),
        signature: { status: "Valid" },
      },
      installerProof({ timestamped: "true" }),
    ]) {
      await expect(
        evaluateExternalLink({
          kind: "download",
          url: "https://downloads.example.com/daybreak.exe",
          expectedSha256:
            "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
          fetchImpl: fetchBody(200, "hello"),
          signatureImpl: signature("Valid", "CN=Passive Print Labs LLC"),
          installerProof: installerProofData,
        }),
      ).resolves.toMatchObject({
        pass: false,
        reason: "installer_proof_malformed",
      });
    }

    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("Valid", "CN=Passive Print Labs LLC"),
        installerProof: installerProof({ timestamped: false }),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "installer_signature_not_valid",
    });
  });

  it("rejects installer proof that contains signing secrets or request logs", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("Valid", "CN=Passive Print Labs LLC"),
        installerProof: {
          ...installerProof(),
          signing: {
            certificate_private_key: "-----BEGIN PRIVATE KEY-----",
          },
        },
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "installer_proof_contains_sensitive_data",
    });
  });

  it("rejects installer proof with auth header or secret key variants", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("Valid", "CN=Passive Print Labs LLC"),
        installerProof: {
          ...installerProof(),
          response_headers: {
            "Set-Cookie": "session=secret",
          },
        },
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "installer_proof_contains_sensitive_data",
    });

    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("Valid", "CN=Passive Print Labs LLC"),
        installerProof: {
          ...installerProof(),
          stripe_secret_key: "sk_live_secret",
        },
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "installer_proof_contains_sensitive_data",
    });
  });

  it("passes installer download only when the fetched bytes match and the signer is Passive Print Labs", async () => {
    await expect(
      evaluateExternalLink({
        kind: "download",
        url: "https://downloads.example.com/daybreak.exe",
        expectedSha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        fetchImpl: fetchBody(200, "hello"),
        signatureImpl: signature("Valid", "CN=Passive Print Labs LLC"),
        installerProof: installerProof(),
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

  it("accepts GitHub Pages IPv6 records alongside the required A records", async () => {
    await expect(
      evaluateProductionDomain({
        host: "www.daybreak.rest",
        url: "https://www.daybreak.rest/",
        lookupImpl: async () => [
          "2606:50c0:8000::153",
          "2606:50c0:8001::153",
          "2606:50c0:8002::153",
          "2606:50c0:8003::153",
          "185.199.108.153",
          "185.199.109.153",
          "185.199.110.153",
          "185.199.111.153",
        ],
        fetchImpl: fetchPage(200, "Daybreak"),
      }),
    ).resolves.toMatchObject({ pass: true });
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

  it("keeps the production domain pending with the underlying TLS cause visible", async () => {
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
        fetchImpl: fetchErrorWithCause("fetch failed", {
          code: "ERR_TLS_CERT_ALTNAME_INVALID",
          message: "Hostname/IP does not match certificate's altnames",
        }),
      }),
    ).resolves.toMatchObject({
      pass: false,
      reason: "apex_https_not_ready",
      detail:
        "HTTPS error contains_daybreak=false error=fetch failed cause=ERR_TLS_CERT_ALTNAME_INVALID: Hostname/IP does not match certificate's altnames",
    });
  });

  it("keeps the readiness domain gate pending when www HTTPS is not ready", async () => {
    const root = makeReadinessRoot();
    try {
      const gates = await buildReadinessGates({
        root,
        lookupImpl: async () => [
          "185.199.108.153",
          "185.199.109.153",
          "185.199.110.153",
          "185.199.111.153",
        ],
        fetchImpl: async (url: string) => {
          if (url === "https://daybreak.rest/") {
            return { ok: true, status: 200, text: async () => "Daybreak" };
          }
          if (url === "https://www.daybreak.rest/") {
            return {
              ok: false,
              status: 495,
              text: async () => "certificate pending",
            };
          }
          throw new Error(`unexpected fetch ${url}`);
        },
      });

      const domain = gates.find(
        (gate) => gate.name === "Production domain owned + attached",
      );

      expect(domain).toMatchObject({ pass: false });
      expect(domain?.detail).toContain("www.daybreak.rest");
      expect(domain?.detail).toContain("HTTPS 495");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
