// Builds the morning and evening sessions from history.
// Carry-over rule: any item left "open" or "deferred" on a prior day is
// surfaced again on the next morning, with its carryCount incremented.

import { DayLog, Item, Phase } from "./model.js";
import { dayKey } from "./dates.js";
import { canDismiss } from "./wipe.js";

let idCounter = 0;

/** Keep new commitments distinct from every saved item after an app restart. */
export function createItemIdFactory(history: DayLog[]): () => string {
  const used = new Set(history.flatMap((log) => log.items.map((item) => item.id)));
  let next = 0;
  return () => {
    let id: string;
    do {
      id = `item-${++next}`;
    } while (used.has(id));
    used.add(id);
    return id;
  };
}

/**
 * Deterministic id generator (no Math.random in core).
 * Persistent hosts must pass a factory seeded from their saved history.
 * The default monotonic counter is suitable for transient boards and fixtures.
 */
export function makeItem(
  text: string,
  day: string,
  idFactory: () => string = () => `item-${++idCounter}`,
): Item {
  return {
    id: idFactory(),
    text: text.trim(),
    day,
    state: "pending",
    createdDay: day,
    carryCount: 0,
  };
}

/** Items that should roll forward into the next morning. */
export function carryForward(history: DayLog[]): Item[] {
  const latestById = new Map<string, Item>();
  const chronological = [...history].sort((a, b) =>
    a.day < b.day ? -1 : a.day > b.day ? 1 : 0,
  );

  for (const log of chronological) {
    for (const item of log.items) {
      latestById.set(item.id, item);
    }
  }

  return [...latestById.values()]
    .filter(
      (item) =>
        item.state === "pending" ||
        item.state === "open" ||
        item.state === "deferred",
    )
    .map((item) => ({
      ...item,
      state: "pending",
      carryCount: item.carryCount + 1,
    }));
}

/**
 * Compose the morning session: carried-over items first (oldest pain on top),
 * ready for the user to wipe, plus space for new commits.
 */
export function buildMorningSession(now: Date, history: DayLog[]): DayLog {
  const day = dayKey(now);
  const existing = history.find((log) => log.day === day);
  if (existing) {
    return {
      ...existing,
      items: existing.items.map((i) => ({
        ...i,
        state:
          !existing.morningResolved && i.state === "open"
            ? "pending"
            : i.state,
      })),
    };
  }

  const carried = carryForward(history).sort(
    (a, b) => b.carryCount - a.carryCount,
  );
  // Re-home carried items onto today so they persist against the current day.
  const items = carried.map((i) => ({ ...i, day }));
  return { day, morningResolved: false, eveningResolved: false, items };
}

/** Evening session is just today's log, surfaced for the done/missed gesture. */
export function buildEveningSession(today: DayLog): DayLog {
  return { ...today, items: today.items.map((i) => ({ ...i })) };
}

export function phaseForHour(hour: number): Phase {
  // Before 17:00 local → morning ritual; 17:00+ → evening review.
  return hour < 17 ? "morning" : "evening";
}

export function buildDaySession(
  now: Date,
  history: DayLog[],
): { phase: Phase; log: DayLog } {
  const phase = phaseForHour(now.getHours());
  const today = dayKey(now);
  const existing = history.find((log) => log.day === today);
  if (phase === "morning" || !existing?.morningResolved) {
    return { phase: "morning", log: buildMorningSession(now, history) };
  }

  return {
    phase,
    log: buildEveningSession(existing),
  };
}

/** Return a log with only the active ritual's resolved flag recalculated. */
export function resolveLogForPhase(log: DayLog, phase: Phase): DayLog {
  const resolved = canDismiss(log.items, phase);
  return phase === "morning"
    ? { ...log, morningResolved: resolved }
    : { ...log, eveningResolved: resolved };
}
