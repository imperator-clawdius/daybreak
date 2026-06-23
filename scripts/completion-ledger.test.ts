import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("completion ledger", () => {
  it("keeps the documented test-count evidence current", () => {
    const ledger = readFileSync(
      join(process.cwd(), "docs", "COMPLETION.md"),
      "utf8",
    );

    expect(ledger).toContain("**300 tests, 34 files passed**");
    expect(ledger).toContain("completion ledger evidence contract");
    expect(ledger).toContain("dark browser chrome metadata");
    expect(ledger).toContain("honest update-promise copy");
    expect(ledger).toContain("icon consistency contract");
    expect(ledger).toContain("legal effective-date export");
    expect(ledger).toContain("legal sale-state terms copy");
    expect(ledger).toContain("local data deletion guide");
    expect(ledger).toContain("live clean-surface verification");
    expect(ledger).toContain("live homepage identity verification");
    expect(ledger).toContain("live legal effective-date verification");
    expect(ledger).toContain("live public-copy verification");
    expect(ledger).toContain("readiness domain public-page policy");
    expect(ledger).toContain("proof artifact operator guide");
    expect(ledger).toContain("packaged close-prevention smoke proof");
    expect(ledger).toContain("release publish policy");
    expect(ledger).toContain("Proof artifact instructions are minimal and redacted");
    expect(ledger).toContain("Windows shell metadata preflight");
    expect(ledger).not.toContain("**299 tests, 34 files passed**");
    expect(ledger).not.toContain("**296 tests, 33 files passed**");
    expect(ledger).toContain("Pages workflow proof/dependency/live-gate coverage");
    expect(ledger).toContain("CI runs repo and launch-drift gates");
    expect(ledger).not.toContain("**295 tests, 33 files passed**");
    expect(ledger).not.toContain("**293 tests, 32 files passed**");
    expect(ledger).not.toContain("**292 tests, 32 files passed**");
    expect(ledger).not.toContain("**291 tests, 32 files passed**");
    expect(ledger).not.toContain("**288 tests, 32 files passed**");
    expect(ledger).not.toContain("**287 tests, 32 files passed**");
    expect(ledger).not.toContain("**285 tests, 32 files passed**");
    expect(ledger).not.toContain("**284 tests, 32 files passed**");
    expect(ledger).not.toContain("**282 tests, 32 files passed**");
    expect(ledger).not.toContain("**281 tests, 32 files passed**");
    expect(ledger).not.toContain("**279 tests, 32 files passed**");
    expect(ledger).not.toContain("**278 tests, 32 files passed**");
    expect(ledger).not.toContain("**277 tests, 32 files passed**");
    expect(ledger).not.toContain("**276 tests, 32 files passed**");
    expect(ledger).not.toContain("**274 tests, 32 files passed**");
    expect(ledger).not.toContain("**269 tests, 30 files passed**");
  });
});
