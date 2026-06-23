import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(path, "utf8");
}

describe("legal checkout copy", () => {
  it("does not hard-code checkout as unavailable after Stripe proof can make it live", () => {
    const terms = source("site/app/terms/page.tsx");
    const privacy = source("site/app/privacy/page.tsx");

    expect(terms).toContain("getPublicCheckoutState");
    expect(privacy).toContain("getPublicCheckoutState");
    expect(terms).toContain("purchaseTermsCopy(checkoutReady, PRICE_USD)");
    expect(terms).toContain("refundTermsCopy(checkoutReady)");
    expect(terms).not.toContain("Checkout is not live yet");
    expect(privacy).not.toContain("Checkout is not live yet");
    expect(terms).not.toContain("The planned launch price is");
    expect(terms).not.toContain("once checkout is live");
  });

  it("scopes update promises to the v1 maintenance surface", () => {
    const copy = source("site/app/legal-copy.ts");
    const page = source("site/app/page.tsx");

    expect(copy).toContain("included v1 maintenance updates");
    expect(page).toContain("v1 maintenance updates");
    expect(copy.toLowerCase()).not.toContain("lifetime updates");
    expect(page.toLowerCase()).not.toContain("lifetime updates");
  });
});
