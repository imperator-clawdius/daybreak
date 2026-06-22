import { describe, expect, it } from "vitest";

import { getPaidOrderProofState } from "../src/market-signal";

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
    refunds: {
      data: [],
    },
    ...overrides,
  };
}

describe("paid order proof", () => {
  it("accepts only a paid live one-time Stripe order for the configured $19 link", () => {
    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof(),
      }),
    ).toMatchObject({
      ready: true,
      reason: "ready",
      paidOrders: 1,
      refunds: 0,
    });
  });

  it("keeps market signal pending when paid-order proof is absent", () => {
    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: null,
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_proof_missing",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("rejects test mode, unpaid, refunded, wrong price, and wrong link proof", () => {
    const base = paidOrderProof();

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...base,
          checkout_session: { ...base.checkout_session, livemode: false },
        },
      }),
    ).toMatchObject({ ready: false, reason: "paid_order_not_live_mode" });

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...base,
          checkout_session: { ...base.checkout_session, payment_status: "unpaid" },
        },
      }),
    ).toMatchObject({ ready: false, reason: "paid_order_not_paid" });

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...base,
          refunds: { data: [{ id: "re_live_123" }] },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_refunded",
      paidOrders: 1,
      refunds: 1,
    });

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...base,
          checkout_session: { ...base.checkout_session, amount_total: 2000 },
        },
      }),
    ).toMatchObject({ ready: false, reason: "paid_order_amount_mismatch" });

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...base,
          payment_link: { ...base.payment_link, url: "https://buy.stripe.com/other" },
        },
      }),
    ).toMatchObject({ ready: false, reason: "paid_order_checkout_mismatch" });
  });

  it("requires explicit empty refund data before counting a paid order", () => {
    const { refunds: _refunds, ...missingRefunds } = paidOrderProof();

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: missingRefunds,
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_refund_proof_missing",
      paidOrders: 0,
      refunds: 0,
    });

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({ refunds: { data: "not-an-array" } }),
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_refund_proof_missing",
      paidOrders: 0,
      refunds: 0,
    });
  });

  it("rejects first-order proof that includes customer personal data", () => {
    const base = paidOrderProof();

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...base,
          checkout_session: {
            ...base.checkout_session,
            customer_email: "buyer@example.com",
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_proof_contains_customer_data",
    });

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: {
          ...base,
          checkout_session: {
            ...base.checkout_session,
            customer_details: { email: "buyer@example.com", name: "Buyer" },
          },
        },
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_proof_contains_customer_data",
    });
  });

  it("rejects first-order proof that includes request logs or private material", () => {
    expect(
      getPaidOrderProofState({
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
      ready: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          signing: {
            private_key: "-----BEGIN PRIVATE KEY-----",
          },
        }),
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });
  });

  it("rejects first-order proof with auth header or camel-case secret key variants", () => {
    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          headers: {
            Authorization: "Bearer sk_live_secret",
          },
        }),
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });

    expect(
      getPaidOrderProofState({
        checkoutUrl: "https://buy.stripe.com/live_123",
        expectedPriceUsd: 19,
        proof: paidOrderProof({
          apiKey: "sk_live_secret",
        }),
      }),
    ).toMatchObject({
      ready: false,
      reason: "paid_order_proof_contains_customer_data",
      paidOrders: 0,
    });
  });
});
