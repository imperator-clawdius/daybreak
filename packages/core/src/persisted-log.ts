import type { DayLog, Item, ItemState } from "./model.js";

const ITEM_STATES: ReadonlySet<ItemState> = new Set([
  "pending",
  "open",
  "done",
  "deferred",
  "killed",
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isPersistedItem(value: unknown): value is Item {
  if (!isObject(value)) return false;
  return (
    typeof value.id === "string" &&
    value.id.length > 0 &&
    typeof value.text === "string" &&
    value.text.trim().length > 0 &&
    isDayKey(value.day) &&
    typeof value.state === "string" &&
    ITEM_STATES.has(value.state as ItemState) &&
    isDayKey(value.createdDay) &&
    Number.isInteger(value.carryCount) &&
    Number(value.carryCount) >= 0
  );
}

export function isPersistedDayLog(value: unknown): value is DayLog {
  if (!isObject(value)) return false;
  if (
    !isDayKey(value.day) ||
    typeof value.morningResolved !== "boolean" ||
    typeof value.eveningResolved !== "boolean" ||
    !Array.isArray(value.items) ||
    !value.items.every(isPersistedItem)
  ) {
    return false;
  }

  const seenIds = new Set<string>();
  for (const item of value.items) {
    if (seenIds.has(item.id) || item.day !== value.day) return false;
    seenIds.add(item.id);
  }
  return true;
}

export function isPersistedDayLogArray(value: unknown): value is DayLog[] {
  if (!Array.isArray(value) || !value.every(isPersistedDayLog)) return false;

  const seenDays = new Set<string>();
  for (const log of value) {
    if (seenDays.has(log.day)) return false;
    seenDays.add(log.day);
  }
  return true;
}
