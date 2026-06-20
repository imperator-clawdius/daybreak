import { describe, it, expect } from "vitest";
import {
  buildEveningSession,
  buildMorningSession,
  carryForward,
  makeItem,
  phaseForHour,
} from "../src/session";
import { DayLog, Item } from "../src/model";

function logFor(day: string, items: Item[]): DayLog {
  return { day, morningResolved: true, eveningResolved: false, items };
}

describe("session building", () => {
  it("carries open and deferred items forward, dropping done and killed", () => {
    const history: DayLog[] = [
      logFor("2026-06-17", [
        { ...makeItem("still open", "2026-06-17"), state: "open" },
        { ...makeItem("pushed", "2026-06-17"), state: "deferred" },
        { ...makeItem("finished", "2026-06-17"), state: "done" },
        { ...makeItem("abandoned", "2026-06-17"), state: "killed" },
      ]),
    ];
    const carried = carryForward(history);
    expect(carried.map((i) => i.text).sort()).toEqual(["pushed", "still open"]);
    expect(carried.every((i) => i.state === "open")).toBe(true);
    expect(carried.every((i) => i.carryCount === 1)).toBe(true);
  });

  it("re-homes carried items onto today and surfaces oldest pain first", () => {
    const history: DayLog[] = [
      logFor("2026-06-17", [
        { ...makeItem("old", "2026-06-15"), state: "open", carryCount: 2 },
        { ...makeItem("newer", "2026-06-17"), state: "open", carryCount: 0 },
      ]),
    ];
    const now = new Date(2026, 5, 19, 8, 0, 0); // 2026-06-19 08:00 local
    const session = buildMorningSession(now, history);
    expect(session.day).toBe("2026-06-19");
    expect(session.items[0].text).toBe("old"); // higher carryCount on top
    expect(session.items.every((i) => i.day === "2026-06-19")).toBe(true);
    expect(session.items[0].carryCount).toBe(3);
    expect(session.morningResolved).toBe(false);
  });

  it("evening session deep-copies today's items", () => {
    const today = logFor("2026-06-19", [makeItem("a", "2026-06-19")]);
    const evening = buildEveningSession(today);
    expect(evening.items[0]).not.toBe(today.items[0]);
    expect(evening.items[0].text).toBe("a");
  });

  it("splits the day into morning and evening at 17:00", () => {
    expect(phaseForHour(6)).toBe("morning");
    expect(phaseForHour(16)).toBe("morning");
    expect(phaseForHour(17)).toBe("evening");
    expect(phaseForHour(22)).toBe("evening");
  });
});
