import { describe, it, expect } from "vitest";
import {
  buildDaySession,
  buildEveningSession,
  buildMorningSession,
  carryForward,
  makeItem,
  phaseForHour,
  resolveLogForPhase,
} from "../src/session";
import { DayLog, Item } from "../src/model";

function logFor(day: string, items: Item[]): DayLog {
  return { day, morningResolved: true, eveningResolved: false, items };
}

describe("session building", () => {
  it("builds a morning day session before 17:00", () => {
    const history: DayLog[] = [
      logFor("2026-06-21", [
        { ...makeItem("carry me", "2026-06-21"), state: "open" },
      ]),
    ];

    const session = buildDaySession(new Date(2026, 5, 22, 8, 0, 0), history);

    expect(session.phase).toBe("morning");
    expect(session.log).toMatchObject({
      day: "2026-06-22",
      morningResolved: false,
    });
    expect(session.log.items[0]).toMatchObject({
      text: "carry me",
      state: "pending",
      day: "2026-06-22",
    });
  });

  it("builds an evening day session from today's saved commitments", () => {
    const today = logFor("2026-06-22", [
      { ...makeItem("ship", "2026-06-22"), state: "open" },
    ]);

    const session = buildDaySession(new Date(2026, 5, 22, 18, 0, 0), [today]);

    expect(session.phase).toBe("evening");
    expect(session.log.items[0]).toMatchObject({
      text: "ship",
      state: "open",
      day: "2026-06-22",
    });
    expect(session.log.items[0]).not.toBe(today.items[0]);
  });

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
    expect(carried.every((i) => i.state === "pending")).toBe(true);
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

  it("carries only the latest unresolved copy of an item", () => {
    const item = makeItem("same promise", "2026-06-17", () => "same-id");
    const history: DayLog[] = [
      logFor("2026-06-17", [{ ...item, state: "open", carryCount: 0 }]),
      logFor("2026-06-18", [
        { ...item, day: "2026-06-18", state: "open", carryCount: 1 },
      ]),
    ];

    const carried = carryForward(history);

    expect(carried).toHaveLength(1);
    expect(carried[0]).toMatchObject({
      id: "same-id",
      text: "same promise",
      carryCount: 2,
      state: "pending",
    });
  });

  it("does not resurrect an item resolved after it was carried", () => {
    const item = makeItem("decide", "2026-06-17", () => "resolved-id");
    const history: DayLog[] = [
      logFor("2026-06-17", [{ ...item, state: "open", carryCount: 0 }]),
      logFor("2026-06-18", [
        { ...item, day: "2026-06-18", state: "killed", carryCount: 1 },
      ]),
    ];

    expect(carryForward(history)).toEqual([]);
  });

  it("reuses today's saved morning board without incrementing carry count", () => {
    const todayItem = {
      ...makeItem("same-day commitment", "2026-06-19"),
      state: "pending" as const,
      carryCount: 2,
    };
    const history: DayLog[] = [logFor("2026-06-19", [todayItem])];

    const session = buildMorningSession(
      new Date(2026, 5, 19, 8, 0, 0),
      history,
    );

    expect(session.items).toHaveLength(1);
    expect(session.items[0]).toMatchObject({
      text: "same-day commitment",
      state: "pending",
      carryCount: 2,
      day: "2026-06-19",
    });
  });

  it("treats unresolved same-day open items as still pending", () => {
    const oldShapeItem = {
      ...makeItem("pre-migration item", "2026-06-19"),
      state: "open" as const,
    };
    const history: DayLog[] = [
      {
        ...logFor("2026-06-19", [oldShapeItem]),
        morningResolved: false,
      },
    ];

    const session = buildMorningSession(
      new Date(2026, 5, 19, 8, 0, 0),
      history,
    );

    expect(session.items[0]).toMatchObject({
      text: "pre-migration item",
      state: "pending",
    });
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

  it("marks only the active phase as resolved", () => {
    const log = logFor("2026-06-19", [
      { ...makeItem("done", "2026-06-19"), state: "done" },
    ]);

    expect(resolveLogForPhase(log, "morning")).toMatchObject({
      morningResolved: true,
      eveningResolved: false,
    });
    expect(resolveLogForPhase(log, "evening")).toMatchObject({
      morningResolved: true,
      eveningResolved: true,
    });
  });
});
