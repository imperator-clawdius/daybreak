import { describe, it, expect } from "vitest";
import {
  applyWipe,
  canDismiss,
  committedCount,
  isMorningResolved,
  isOverCommitted,
  isResolved,
  stateAfter,
} from "../src/wipe";
import { makeItem } from "../src/session";
import { Item } from "../src/model";

function open(text: string): Item {
  return makeItem(text, "2026-06-19");
}

describe("wipe state machine", () => {
  it("maps each gesture to the right state", () => {
    expect(stateAfter("commit", "morning")).toBe("open");
    expect(stateAfter("done", "evening")).toBe("done");
    expect(stateAfter("defer", "morning")).toBe("deferred");
    expect(stateAfter("kill", "morning")).toBe("killed");
  });

  it("applyWipe never mutates the input item", () => {
    const item = open("ship daybreak");
    const wiped = applyWipe(item, "done", "evening");
    expect(item.state).toBe("open");
    expect(wiped.state).toBe("done");
    expect(wiped).not.toBe(item);
  });

  it("treats done/deferred/killed as resolved and open as unresolved", () => {
    expect(isResolved(applyWipe(open("a"), "done", "evening"))).toBe(true);
    expect(isResolved(applyWipe(open("a"), "defer", "morning"))).toBe(true);
    expect(isResolved(applyWipe(open("a"), "kill", "morning"))).toBe(true);
    expect(isResolved(open("a"))).toBe(false);
  });

  it("blocks dismissal while any item is still open in the morning", () => {
    const items = [open("a"), applyWipe(open("b"), "defer", "morning")];
    expect(isMorningResolved(items)).toBe(false);
    expect(canDismiss(items, "morning")).toBe(false);
  });

  it("allows dismissal once every item is wiped", () => {
    const items = [
      applyWipe(open("a"), "commit", "morning"),
      applyWipe(open("b"), "kill", "morning"),
    ];
    // "commit" leaves an item open, so morning is NOT yet resolved.
    expect(isMorningResolved(items)).toBe(false);
    const allWiped = items.map((i) =>
      i.state === "open" ? applyWipe(i, "defer", "morning") : i,
    );
    expect(isMorningResolved(allWiped)).toBe(true);
    expect(canDismiss(allWiped, "morning")).toBe(true);
  });

  it("never lets an empty morning be dismissed", () => {
    expect(isMorningResolved([])).toBe(false);
    expect(canDismiss([], "morning")).toBe(false);
  });

  it("counts commitments and flags over-commitment past the cap of 3", () => {
    const four = [open("a"), open("b"), open("c"), open("d")];
    expect(committedCount(four)).toBe(4);
    expect(isOverCommitted(four)).toBe(true);
    const three = four.slice(0, 3);
    expect(isOverCommitted(three)).toBe(false);
  });
});
