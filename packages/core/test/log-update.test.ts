import { describe, expect, it } from "vitest";
import { applyWipe } from "../src/wipe";
import { makeItem } from "../src/session";
import { isValidLogUpdatePayload, validateLogUpdate } from "../src/log-update";
import type { DayLog, Item } from "../src/model";

function logFor(items: Item[]): DayLog {
  return {
    day: "2026-06-22",
    morningResolved: false,
    eveningResolved: false,
    items,
  };
}

function item(text: string, id: string): Item {
  return makeItem(text, "2026-06-22", () => id);
}

describe("log update validation", () => {
  it("accepts a normal morning commit decision without changing immutable item fields", () => {
    const current = logFor([item("ship installer", "a")]);
    const next = logFor([
      applyWipe(current.items[0], "commit", "morning"),
    ]);

    const result = validateLogUpdate(current, next, "morning");

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.log.items[0]).toMatchObject({
        id: "a",
        text: "ship installer",
        state: "open",
        carryCount: 0,
      });
    }
  });

  it("rejects a renderer update that drops an existing pending item", () => {
    const current = logFor([item("ship installer", "a"), item("write copy", "b")]);
    const next = logFor([applyWipe(current.items[0], "commit", "morning")]);

    expect(validateLogUpdate(current, next, "morning")).toEqual({
      ok: false,
      reason: "missing-existing-item",
    });
  });

  it("rejects renderer changes to existing item text and carry count", () => {
    const current = logFor([{ ...item("ship installer", "a"), carryCount: 2 }]);
    const next = logFor([
      {
        ...current.items[0],
        text: "different",
        carryCount: 0,
        state: "open",
      },
    ]);

    expect(validateLogUpdate(current, next, "morning")).toEqual({
      ok: false,
      reason: "mutated-existing-item",
    });
  });

  it("accepts a valid new pending morning commitment under the cap", () => {
    const current = logFor([item("ship installer", "a")]);
    const next = logFor([
      current.items[0],
      item("write launch email", "b"),
    ]);

    const result = validateLogUpdate(current, next, "morning");

    expect(result).toMatchObject({ ok: true });
    if (result.ok) {
      expect(result.log.items.map((i) => i.text)).toEqual([
        "ship installer",
        "write launch email",
      ]);
    }
  });

  it("rejects new items during evening review", () => {
    const current = logFor([{ ...item("ship installer", "a"), state: "open" }]);
    const next = logFor([
      current.items[0],
      item("late add", "b"),
    ]);

    expect(validateLogUpdate(current, next, "evening")).toEqual({
      ok: false,
      reason: "new-item-not-allowed",
    });
  });

  it("rejects a fourth live morning commitment", () => {
    const current = logFor([
      item("a", "a"),
      item("b", "b"),
      item("c", "c"),
    ]);
    const next = logFor([
      ...current.items,
      item("d", "d"),
    ]);

    expect(validateLogUpdate(current, next, "morning")).toEqual({
      ok: false,
      reason: "invalid-new-commitment",
    });
  });

  it("rejects malformed IPC log-update payloads before domain validation", () => {
    const valid = { phase: "morning", log: logFor([item("ship installer", "a")]) };

    for (const payload of [
      null,
      [],
      "not an object",
      { ...valid, phase: "noon" },
      { ...valid, phase: 12 },
      { phase: "morning" },
      { log: valid.log },
      { ...valid, log: { ...valid.log, items: null } },
      { ...valid, log: { ...valid.log, day: "tomorrow" } },
    ]) {
      expect(isValidLogUpdatePayload(payload)).toBe(false);
    }

    expect(isValidLogUpdatePayload(valid)).toBe(true);
    expect(isValidLogUpdatePayload({ ...valid, phase: "evening" })).toBe(true);
  });
});
