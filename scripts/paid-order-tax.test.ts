import { describe, expect, it } from "vitest";
import { getPaidOrderProofState } from "../packages/core/src/market-signal";
import { evaluateMarketSignal } from "./readiness-core.mjs";

const options = {
  checkoutUrl: "https://buy.stripe.com/fictional_tax_proof",
  expectedPriceUsd: 19,
  expectedPaymentLinkId: "plink_fictional_tax_proof",
};

function taxedOrder() {
  return {
    payment_link: { id: options.expectedPaymentLinkId, url: options.checkoutUrl },
    checkout_session: {
      id: "cs_live_fictional_tax_proof", livemode: true, mode: "payment",
      status: "complete", payment_status: "paid",
      payment_link: options.expectedPaymentLinkId, currency: "usd",
      amount_subtotal: 1900, amount_total: 2024,
      total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 124 },
    },
    refunds: { data: [], has_more: false },
  };
}

const implementations = [
  ["core", (proof: unknown) => getPaidOrderProofState({ ...options, proof }).ready],
  ["release CLI", (proof: unknown) => evaluateMarketSignal({ ...options, proof }).pass],
] as const;

for (const [name, ready] of implementations) describe(`${name} itemized purchase proof`, () => {
  it("recognizes the $19 item price plus separately reported tax", () => {
    expect(ready(taxedOrder())).toBe(true);
  });

  it("recognizes a complete zero-tax breakdown", () => {
    const proof = taxedOrder();
    proof.checkout_session.amount_total = 1900;
    proof.checkout_session.total_details.amount_tax = 0;
    expect(ready(proof)).toBe(true);
  });

  it.each([
    ["wrong item price", { amount_subtotal: 2000, amount_total: 2124 }],
    ["unexplained extra charge", { amount_total: 2025 }],
    ["missing subtotal", { amount_subtotal: undefined }],
    ["missing breakdown", { total_details: undefined }],
    ["null breakdown", { total_details: null }],
    ["array breakdown", { total_details: [0, 0, 124] }],
    ["string subtotal", { amount_subtotal: "1900" }],
    ["fractional subtotal", { amount_subtotal: 1900.5 }],
    ["unsafe total", { amount_total: Number.MAX_SAFE_INTEGER + 1 }],
    ["non-USD currency", { currency: "eur" }],
    ["test mode", { livemode: false }],
    ["unpaid session", { payment_status: "unpaid" }],
    ["incomplete session", { status: "open" }],
    ["subscription", { mode: "subscription" }],
    ["another payment link", { payment_link: "plink_another_fixture" }],
  ])("refuses %s", (_label, changes) => {
    const proof = taxedOrder();
    expect(ready({ ...proof, checkout_session: { ...proof.checkout_session, ...changes } })).toBe(false);
  });

  it.each([
    ["discount", { amount_discount: 1 }],
    ["shipping", { amount_shipping: 1 }],
    ["negative tax", { amount_tax: -1 }],
    ["string tax", { amount_tax: "124" }],
    ["fractional tax", { amount_tax: 124.5 }],
    ["unsafe tax", { amount_tax: Number.MAX_SAFE_INTEGER + 1 }],
    ["missing discount amount", { amount_discount: undefined }],
    ["extra nested breakdown", { breakdown: {} }],
    ["private fields", { customer_email: "fictional@example.invalid" }],
  ])("refuses %s in total details", (_label, changes) => {
    const proof = taxedOrder();
    const details = { ...proof.checkout_session.total_details, ...changes };
    expect(ready({ ...proof, checkout_session: { ...proof.checkout_session, total_details: details } })).toBe(false);
  });

  it("keeps the tax exception limited to the exact Checkout Session field", () => {
    const proof = taxedOrder();
    expect(ready({ ...proof, total_details: proof.checkout_session.total_details })).toBe(false);
    expect(ready({ ...proof, extra: { total_details: proof.checkout_session.total_details } })).toBe(false);
    expect(ready({ ...proof, checkout_session: { ...proof.checkout_session, totalDetails: proof.checkout_session.total_details } })).toBe(false);
  });

  it("refuses an itemized sum outside safe integer cents", () => {
    const proof = taxedOrder();
    proof.checkout_session.total_details.amount_tax = Number.MAX_SAFE_INTEGER;
    proof.checkout_session.amount_total = Number.MAX_SAFE_INTEGER + 1900;
    expect(ready(proof)).toBe(false);
  });

  it("still requires complete, unrefunded payment evidence", () => {
    const proof = taxedOrder();
    expect(ready({ ...proof, refunds: { data: [], has_more: true } })).toBe(false);
    expect(ready({ ...proof, refunds: { data: [{}], has_more: false } })).toBe(false);
    expect(ready({ ...proof, refunds: undefined })).toBe(false);
  });
});
