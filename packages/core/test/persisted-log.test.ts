import { describe, expect, it } from "vitest";
import {
  isPersistedDayLog,
  isPersistedDayLogArray,
} from "../src/persisted-log";
import type { DayLog } from "../src/model";

const validLog: DayLog = {
  day: "2026-06-22",
  morningResolved: false,
  eveningResolved: false,
  items: [
    {
      id: "a",
      text: "ship",
      day: "2026-06-22",
      state: "pending",
      createdDay: "2026-06-22",
      carryCount: 0,
    },
  ],
};

describe("persisted day log validation", () => {
  it("accepts a complete persisted day log", () => {
    expect(isPersistedDayLog(validLog)).toBe(true);
  });

  it("rejects a day log with a malformed day key", () => {
    expect(isPersistedDayLog({ ...validLog, day: "tomorrow" })).toBe(false);
  });

  it("rejects a day log with invalid item state", () => {
    expect(
      isPersistedDayLog({
        ...validLog,
        items: [{ ...validLog.items[0], state: "unknown" }],
      }),
    ).toBe(false);
  });

  it("rejects a day log with an invalid carry count", () => {
    expect(
      isPersistedDayLog({
        ...validLog,
        items: [{ ...validLog.items[0], carryCount: -1 }],
      }),
    ).toBe(false);
  });

  it("rejects a day log whose items are not an array", () => {
    expect(isPersistedDayLog({ ...validLog, items: null })).toBe(false);
  });

  it("rejects a day log with duplicate item ids or items assigned to another day", () => {
    expect(
      isPersistedDayLog({
        ...validLog,
        items: [validLog.items[0], { ...validLog.items[0], text: "duplicate" }],
      }),
    ).toBe(false);

    expect(
      isPersistedDayLog({
        ...validLog,
        items: [{ ...validLog.items[0], day: "2026-06-23" }],
      }),
    ).toBe(false);
  });

  it("accepts only arrays where every day log is valid", () => {
    expect(isPersistedDayLogArray([validLog])).toBe(true);
    expect(isPersistedDayLogArray([validLog, { ...validLog, day: "" }])).toBe(
      false,
    );
  });
});
