// Streak math. A day "counts" toward the streak when the morning ritual was
// completed AND the user committed to at least one thing that day.

import { DayLog } from "./model";
import { addDays, dayKey, weekStartKey } from "./dates";

export function dayCounts(log: DayLog): boolean {
  return log.morningResolved && log.items.some((i) => i.state !== "killed");
}

/**
 * Current daily streak ending at `today`: the number of consecutive prior days
 * (including today if it counts) where the ritual was completed.
 */
export function currentStreak(history: DayLog[], today: Date): number {
  const byDay = new Map(history.map((l) => [l.day, l]));
  let streak = 0;
  let cursor = today;
  // Walk backwards while each day counts.
  for (;;) {
    const log = byDay.get(dayKey(cursor));
    if (!log || !dayCounts(log)) break;
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** Distinct ISO weeks (Monday-anchored) in which at least one day counted. */
export function weeklyStreak(history: DayLog[]): number {
  const weeks = new Set<string>();
  for (const log of history) {
    if (dayCounts(log)) {
      // Reconstruct a Date from the day-key to find its week anchor.
      const parts = log.day.split("-").map(Number);
      const y = parts[0] ?? 1970;
      const m = parts[1] ?? 1;
      const d = parts[2] ?? 1;
      weeks.add(weekStartKey(new Date(y, m - 1, d)));
    }
  }
  return weeks.size;
}
