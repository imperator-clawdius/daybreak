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
  return (
    isDayKey(value.day) &&
    typeof value.morningResolved === "boolean" &&
    typeof value.eveningResolved === "boolean" &&
    Array.isArray(value.items) &&
    value.items.every(isPersistedItem)
  );
}

export function isPersistedDayLogArray(value: unknown): value is DayLog[] {
  return Array.isArray(value) && value.every(isPersistedDayLog);
}
