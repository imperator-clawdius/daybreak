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
    expect(terms).not.toContain("Checkout is not live yet");
    expect(privacy).not.toContain("Checkout is not live yet");
  });
});
