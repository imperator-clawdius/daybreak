import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("sale-readiness premortem", () => {
  it("documents generic personal-data leakage in external proof artifacts", () => {
    const premortem = readFileSync(
      join(process.cwd(), "docs", "PREMORTEM.md"),
      "utf8",
    );

    expect(premortem).toContain(
      "Generic personal-data fields in proof artifacts",
    );

    for (const field of [
      "billing_details",
      "shipping_details",
      "email",
      "name",
      "phone",
      "address",
    ]) {
      expect(premortem).toContain(field);
    }
  });

  it("documents decorative hero-art accessibility as a closed risk", () => {
    const premortem = readFileSync(
      join(process.cwd(), "docs", "PREMORTEM.md"),
      "utf8",
    );

    expect(premortem).toContain("Decorative hero art pollutes the accessibility tree");
    expect(premortem).toContain("aria-hidden");
    expect(premortem).toContain("empty image alt");
  });
});
