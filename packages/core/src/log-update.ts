import type { DayLog, Item, ItemState, Phase } from "./model";
import { validateNewCommit } from "./commit";

export type LogUpdateFailureReason =
  | "day-mismatch"
  | "duplicate-item-id"
  | "missing-existing-item"
  | "mutated-existing-item"
  | "invalid-state-for-phase"
  | "new-item-not-allowed"
  | "invalid-new-commitment";

export type LogUpdateResult =
  | { ok: true; log: DayLog }
  | { ok: false; reason: LogUpdateFailureReason };

const MORNING_STATES = new Set<ItemState>([
  "pending",
  "open",
  "deferred",
  "killed",
]);
const EVENING_DECISIONS = new Set<ItemState>(["done", "deferred", "killed"]);

function sameStableFields(a: Item, b: Item): boolean {
  return (
    a.id === b.id &&
    a.text === b.text &&
    a.day === b.day &&
    a.createdDay === b.createdDay &&
    a.carryCount === b.carryCount
  );
}

function isExistingStateAllowed(current: Item, next: Item, phase: Phase): boolean {
  if (next.state === current.state) return true;
  if (phase === "morning") return MORNING_STATES.has(next.state);
  return EVENING_DECISIONS.has(next.state);
}

function isValidNewMorningItem(item: Item, accepted: Item[], day: string): boolean {
  if (item.state !== "pending") return false;
  if (item.day !== day || item.createdDay !== day || item.carryCount !== 0) {
    return false;
  }
  const validation = validateNewCommit(item.text, accepted);
  return validation.ok && validation.text === item.text;
}

export function validateLogUpdate(
  current: DayLog,
  next: DayLog,
  phase: Phase,
): LogUpdateResult {
  if (next.day !== current.day) return { ok: false, reason: "day-mismatch" };

  const seen = new Set<string>();
  for (const item of next.items) {
    if (seen.has(item.id)) return { ok: false, reason: "duplicate-item-id" };
    seen.add(item.id);
  }

  const currentById = new Map(current.items.map((item) => [item.id, item]));
  const nextById = new Map(next.items.map((item) => [item.id, item]));
  for (const item of current.items) {
    if (!nextById.has(item.id)) {
      return { ok: false, reason: "missing-existing-item" };
    }
  }

  const accepted: Item[] = [];
  for (const item of next.items) {
    const existing = currentById.get(item.id);
    if (existing) {
      if (!sameStableFields(existing, item)) {
        return { ok: false, reason: "mutated-existing-item" };
      }
      if (!isExistingStateAllowed(existing, item, phase)) {
        return { ok: false, reason: "invalid-state-for-phase" };
      }
      accepted.push(item);
      continue;
    }

    if (phase !== "morning") {
      return { ok: false, reason: "new-item-not-allowed" };
    }
    if (!isValidNewMorningItem(item, accepted, current.day)) {
      return { ok: false, reason: "invalid-new-commitment" };
    }
    accepted.push(item);
  }

  return {
    ok: true,
    log: {
      ...current,
      items: accepted,
    },
  };
}
