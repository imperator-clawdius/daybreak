// Daybreak core domain model.
// Pure types shared by the desktop app and the verification scripts.
// No I/O, no Electron, no DOM — so it stays trivially testable.

/** A single thing the user is tracking for a given day. */
export interface Item {
  id: string;
  /** Free text the user committed to. */
  text: string;
  /** Day this item belongs to, as a day-key (YYYY-MM-DD, local). */
  day: string;
  /** Lifecycle state. New morning commits start as "open". */
  state: ItemState;
  /** Day-key the item was first created on. Survives carry-over. */
  createdDay: string;
  /** How many mornings this item has been carried forward unresolved. */
  carryCount: number;
}

export type ItemState =
  | "open" // committed, not yet acted on
  | "done" // finished (evening review)
  | "deferred" // pushed to a future day (morning or evening)
  | "killed"; // abandoned on purpose

/** The gesture outcome. The UI maps a physical swipe to one of these. */
export type WipeAction = "commit" | "done" | "defer" | "kill";

/** Which ritual the user is in. */
export type Phase = "morning" | "evening";

/** Everything persisted for one calendar day. */
export interface DayLog {
  day: string;
  /** Whether the morning ritual was completed (all items wiped). */
  morningResolved: boolean;
  /** Whether the evening review was completed. */
  eveningResolved: boolean;
  items: Item[];
}

/** Maximum commits Daybreak asks for each morning (locked v1 scope: 3). */
export const MAX_DAILY_COMMITS = 3;
