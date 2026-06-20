import { describe, it, expect } from "vitest";
import { currentStreak, dayCounts, weeklyStreak } from "../src/streak";
import { makeItem } from "../src/session";
import { DayLog } from "../src/model";

function day(d: string, resolved: boolean, kept = true): DayLog {
  return {
    day: d,
    morningResolved: resolved,
    eveningResolved: false,
    items: kept
      ? [{ ...makeItem("x", d), state: "done" }]
      : [{ ...makeItem("x", d), state: "killed" }],
  };
}

describe("streak math", () => {
  it("a day counts only when morning resolved and something was kept", () => {
    expect(dayCounts(day("2026-06-19", true, true))).toBe(true);
    expect(dayCounts(day("2026-06-19", false, true))).toBe(false);
    expect(dayCounts(day("2026-06-19", true, false))).toBe(false);
  });

  it("counts consecutive days ending today", () => {
    const history = [
      day("2026-06-17", true),
      day("2026-06-18", true),
      day("2026-06-19", true),
    ];
    expect(currentStreak(history, new Date(2026, 5, 19))).toBe(3);
  });

  it("breaks the streak on a missed day", () => {
    const history = [
      day("2026-06-16", true),
      // 2026-06-17 missing entirely
      day("2026-06-18", true),
      day("2026-06-19", true),
    ];
    expect(currentStreak(history, new Date(2026, 5, 19))).toBe(2);
  });

  it("returns zero when today does not count", () => {
    const history = [day("2026-06-19", false)];
    expect(currentStreak(history, new Date(2026, 5, 19))).toBe(0);
  });

  it("counts distinct Monday-anchored weeks for the weekly streak", () => {
    // 2026-06-15 is a Monday; 2026-06-22 is the next Monday.
    const history = [
      day("2026-06-16", true), // week of 06-15
      day("2026-06-19", true), // same week
      day("2026-06-23", true), // week of 06-22
    ];
    expect(weeklyStreak(history)).toBe(2);
  });
});
