import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  getPublicCheckoutState,
  readStripePaymentLinkProof,
} from "../site/app/checkout-state";

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "daybreak-site-proof-test-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const checkoutUrl = "https://buy.stripe.com/live_123";
const matchingProof = {
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
};

describe("public checkout state", () => {
  it("keeps the public checkout pending until Stripe proof is present", () => {
    expect(
      getPublicCheckoutState({
        checkoutUrl,
        expectedPriceUsd: 19,
        proof: null,
      }),
    ).toMatchObject({
      ready: false,
      reason: "checkout_proof_missing",
    });

    expect(
      getPublicCheckoutState({
        checkoutUrl,
        expectedPriceUsd: 19,
        proof: matchingProof,
      }),
    ).toMatchObject({
      ready: true,
      reason: "ready",
    });
  });

  it("loads Stripe proof from repo root or site workspace build context", () =>
    withTempDir((dir) => {
      const siteRoot = join(dir, "site");
      const proofDir = join(dir, "proof");
      mkdirSync(siteRoot);
      mkdirSync(proofDir);
      writeFileSync(
        join(proofDir, "stripe-payment-link.json"),
        JSON.stringify(matchingProof),
        "utf8",
      );

      expect(readStripePaymentLinkProof(dir)).toMatchObject(matchingProof);
      expect(readStripePaymentLinkProof(siteRoot)).toMatchObject(matchingProof);
    }));
});
