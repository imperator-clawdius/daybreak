import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function proofReadme(): string {
  return readFileSync(join(process.cwd(), "proof", "README.md"), "utf8");
}

describe("proof artifact guide", () => {
  it("documents minimal redacted shapes for every readiness proof artifact", () => {
    const readme = proofReadme();

    for (const file of [
      "stripe-payment-link.json",
      "installer-download.json",
      "first-paid-order.json",
    ]) {
      expect(readme).toContain(`\`${file}\``);
    }

    for (const marker of [
      "plink_REPLACE_WITH_LIVE_ID",
      "https://buy.stripe.com/REPLACE_WITH_CANONICAL_PAYMENT_LINK",
      "REPLACE_WITH_SIGNED_INSTALLER_SHA256",
      "CN=Passive Print Labs LLC",
      "cs_live_REPLACE_WITH_SESSION_ID",
      "\"amount_total\": 1900",
      "\"has_more\": false",
    ]) {
      expect(readme).toContain(marker);
    }
  });

  it("warns operators away from sensitive proof fields before artifacts exist", () => {
    const readme = proofReadme();

    for (const field of [
      "customer_email",
      "customer_details",
      "payment_intent",
      "payment_method_details",
      "billing_details",
      "shipping_details",
      "metadata",
      "client_reference_id",
      "allow_promotion_codes",
      "discounts",
      "order_count",
      "session_data",
      "request_headers",
      "response_headers",
      "certificate_private_key",
      "stripe_secret_key",
      "authorization",
      "set-cookie",
      "password",
    ]) {
      expect(readme).toContain(field);
    }
  });
});
