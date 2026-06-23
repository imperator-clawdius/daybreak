import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("completion ledger", () => {
  it("keeps the documented test-count evidence current", () => {
    const ledger = readFileSync(
      join(process.cwd(), "docs", "COMPLETION.md"),
      "utf8",
    );

    expect(ledger).toContain("**271 tests, 31 files passed**");
    expect(ledger).toContain("completion ledger evidence contract");
    expect(ledger).not.toContain("**269 tests, 30 files passed**");
  });
});
