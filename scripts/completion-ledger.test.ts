import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("completion ledger", () => {
  it("keeps the documented test-count evidence current", () => {
    const ledger = readFileSync(
      join(process.cwd(), "docs", "COMPLETION.md"),
      "utf8",
    );

    expect(ledger).toContain("**276 tests, 32 files passed**");
    expect(ledger).toContain("completion ledger evidence contract");
    expect(ledger).toContain("dark browser chrome metadata");
    expect(ledger).toContain("legal sale-state terms copy");
    expect(ledger).not.toContain("**274 tests, 32 files passed**");
    expect(ledger).not.toContain("**269 tests, 30 files passed**");
  });
});
