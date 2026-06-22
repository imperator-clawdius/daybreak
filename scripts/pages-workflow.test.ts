import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function pagesWorkflowSource(): string {
  return readFileSync(".github/workflows/pages.yml", "utf8");
}

describe("Pages deploy workflow", () => {
  it("redeploys when Stripe payment-link proof changes", () => {
    expect(pagesWorkflowSource()).toContain(
      '"proof/stripe-payment-link.json"',
    );
  });

  it("redeploys when signed installer proof changes", () => {
    expect(pagesWorkflowSource()).toContain('"proof/installer-download.json"');
  });
});
