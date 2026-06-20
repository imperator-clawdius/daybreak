// The swipe-to-wipe state machine.
// A morning cannot be dismissed until every surfaced item has been wiped
// (resolved) by an explicit gesture. This module owns that invariant.

import { Item, ItemState, WipeAction, Phase, MAX_DAILY_COMMITS } from "./model";

/** States that count as "resolved" — i.e. the item no longer blocks dismissal. */
const RESOLVED: ReadonlySet<ItemState> = new Set<ItemState>([
  "done",
  "deferred",
  "killed",
]);

export function isResolved(item: Item): boolean {
  return RESOLVED.has(item.state);
}

/** Map a wipe gesture to the resulting item state for a given phase. */
export function stateAfter(action: WipeAction, phase: Phase): ItemState {
  switch (action) {
    case "commit":
      // "commit" keeps an item live for the day. Only meaningful in the morning.
      return "open";
    case "done":
      return "done";
    case "defer":
      return "deferred";
    case "kill":
      return "killed";
    default: {
      // Exhaustiveness guard.
      const never: never = action;
      throw new Error(`Unknown wipe action: ${String(never)}`);
    }
  }
}

/** Apply a wipe to one item, returning a new item (never mutates input). */
export function applyWipe(item: Item, action: WipeAction, phase: Phase): Item {
  return { ...item, state: stateAfter(action, phase) };
}

/**
 * Morning is resolved only when no item is still "open".
 * An empty list is NOT resolved — the user must commit to at least one thing
 * (or explicitly kill the prompt) before Daybreak will let go.
 */
export function isMorningResolved(items: Item[]): boolean {
  if (items.length === 0) return false;
  return items.every((i) => i.state !== "open");
}

/** Evening is resolved when nothing committed today is still hanging "open". */
export function isEveningResolved(items: Item[]): boolean {
  return items.every((i) => i.state !== "open");
}

/**
 * Can the window be dismissed right now?
 * This is the hard gate the renderer enforces — the app stays full-screen
 * until this returns true.
 */
export function canDismiss(items: Item[], phase: Phase): boolean {
  return phase === "morning"
    ? isMorningResolved(items)
    : isEveningResolved(items);
}

/** How many items the user has actively committed to keep for today. */
export function committedCount(items: Item[]): number {
  return items.filter((i) => i.state === "open").length;
}

/** True if the user is trying to over-commit beyond the locked daily cap. */
export function isOverCommitted(items: Item[]): boolean {
  return committedCount(items) > MAX_DAILY_COMMITS;
}
