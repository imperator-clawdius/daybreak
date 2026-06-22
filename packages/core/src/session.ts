// Builds the morning and evening sessions from history.
// Carry-over rule: any item left "open" or "deferred" on a prior day is
// surfaced again on the next morning, with its carryCount incremented.

import { DayLog, Item, Phase } from "./model";
import { dayKey } from "./dates";
import { canDismiss } from "./wipe";

let idCounter = 0;

/**
 * Deterministic id generator (no Math.random in core).
 * The host may pass its own factory; defaults to a monotonic counter.
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
    state: "open",
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
    .filter((item) => item.state === "open" || item.state === "deferred")
    .map((item) => ({
      ...item,
      state: "open",
      carryCount: item.carryCount + 1,
    }));
}

/**
 * Compose the morning session: carried-over items first (oldest pain on top),
 * ready for the user to wipe, plus space for new commits.
 */
export function buildMorningSession(now: Date, history: DayLog[]): DayLog {
  const day = dayKey(now);
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

/** Return a log with only the active ritual's resolved flag recalculated. */
export function resolveLogForPhase(log: DayLog, phase: Phase): DayLog {
  const resolved = canDismiss(log.items, phase);
  return phase === "morning"
    ? { ...log, morningResolved: resolved }
    : { ...log, eveningResolved: resolved };
}
