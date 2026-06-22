import { describe, expect, it } from "vitest";
import {
  MAX_COMMIT_TEXT_LENGTH,
  normalizeCommitText,
  validateNewCommit,
} from "../src/commit";
import { makeItem } from "../src/session";
import type { Item } from "../src/model";

function open(text: string): Item {
  return makeItem(text, "2026-06-19", () => text.toLowerCase());
}

describe("commit validation", () => {
  it("normalizes commitment text before saving", () => {
    expect(normalizeCommitText("  Ship   the   installer  ")).toBe(
      "Ship the installer",
    );
  });

  it("rejects empty commitment text", () => {
    expect(validateNewCommit("   ", [])).toEqual({
      ok: false,
      reason: "empty",
      message: "Write one concrete commitment.",
    });
  });

  it("rejects commitment text that is too long", () => {
    const tooLong = "x".repeat(MAX_COMMIT_TEXT_LENGTH + 1);

    expect(validateNewCommit(tooLong, [])).toEqual({
      ok: false,
      reason: "too_long",
      message: `Keep it under ${MAX_COMMIT_TEXT_LENGTH} characters.`,
    });
  });

  it("rejects duplicates that only differ by case or spacing", () => {
    expect(validateNewCommit("ship   daybreak", [open("Ship Daybreak")])).toEqual({
      ok: false,
      reason: "duplicate",
      message: "That commitment is already on the board.",
    });
  });

  it("rejects a fourth live commitment", () => {
    const items = [open("a"), open("b"), open("c")];

    expect(validateNewCommit("d", items)).toEqual({
      ok: false,
      reason: "over_limit",
      message: "Three is the cap. Wipe something before adding more.",
    });
  });

  it("accepts a normalized unique commitment under the cap", () => {
    expect(validateNewCommit("  Sign installer  ", [open("ship")])).toEqual({
      ok: true,
      text: "Sign installer",
    });
  });
});
