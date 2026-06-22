import { Item, MAX_DAILY_COMMITS } from "./model";
import { committedCount } from "./wipe";

export const MAX_COMMIT_TEXT_LENGTH = 120;

export type CommitValidation =
  | { ok: true; text: string }
  | {
      ok: false;
      reason: "empty" | "too_long" | "duplicate" | "over_limit";
      message: string;
    };

export function normalizeCommitText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

function commitKey(text: string): string {
  return normalizeCommitText(text).toLocaleLowerCase();
}

export function validateNewCommit(
  rawText: string,
  existingItems: Item[],
): CommitValidation {
  const text = normalizeCommitText(rawText);

  if (!text) {
    return {
      ok: false,
      reason: "empty",
      message: "Write one concrete commitment.",
    };
  }

  if (text.length > MAX_COMMIT_TEXT_LENGTH) {
    return {
      ok: false,
      reason: "too_long",
      message: `Keep it under ${MAX_COMMIT_TEXT_LENGTH} characters.`,
    };
  }

  const nextKey = commitKey(text);
  const duplicate = existingItems.some(
    (item) => item.state !== "killed" && commitKey(item.text) === nextKey,
  );
  if (duplicate) {
    return {
      ok: false,
      reason: "duplicate",
      message: "That commitment is already on the board.",
    };
  }

  if (committedCount(existingItems) >= MAX_DAILY_COMMITS) {
    return {
      ok: false,
      reason: "over_limit",
      message: "Three is the cap. Wipe something before adding more.",
    };
  }

  return { ok: true, text };
}
