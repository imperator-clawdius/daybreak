// Local-time date helpers. All "now" values are injected so logic is
// deterministic and testable (no hidden Date.now() inside the core).

/** Day-key in local time: YYYY-MM-DD. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** True when `now` falls on a later day-key than `lastSeen`. */
export function isNewDay(lastSeen: Date, now: Date): boolean {
  return dayKey(now) !== dayKey(lastSeen) && now.getTime() >= lastSeen.getTime();
}

/** Day-key for `n` days before the given date (n may be negative). */
export function addDays(d: Date, n: number): Date {
  const copy = new Date(d.getTime());
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Monday-based start-of-week day-key for the date's week. */
export function weekStartKey(d: Date): string {
  // getDay(): 0=Sun..6=Sat. Shift so Monday is the anchor.
  const dow = (d.getDay() + 6) % 7;
  return dayKey(addDays(d, -dow));
}

/** Ordered list of the day-keys between two dates, inclusive. */
export function dayRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  let cursor = new Date(from.getTime());
  while (dayKey(cursor) <= dayKey(to)) {
    out.push(dayKey(cursor));
    cursor = addDays(cursor, 1);
  }
  return out;
}
