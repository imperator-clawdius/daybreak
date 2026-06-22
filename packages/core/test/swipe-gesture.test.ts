import { describe, expect, it } from "vitest";
import { actionForSwipe } from "../src/swipe-gesture";

describe("swipe gesture policy", () => {
  it("maps a decisive right swipe to the phase primary action", () => {
    expect(
      actionForSwipe({ phase: "morning", deltaX: 120, deltaY: 16 }),
    ).toBe("commit");
    expect(
      actionForSwipe({ phase: "evening", deltaX: 120, deltaY: 16 }),
    ).toBe("done");
  });

  it("maps a decisive left swipe to kill", () => {
    expect(
      actionForSwipe({ phase: "morning", deltaX: -120, deltaY: 12 }),
    ).toBe("kill");
  });

  it("maps a decisive downward swipe to defer", () => {
    expect(
      actionForSwipe({ phase: "evening", deltaX: 12, deltaY: 120 }),
    ).toBe("defer");
  });

  it("ignores short or upward drags", () => {
    expect(actionForSwipe({ phase: "morning", deltaX: 30, deltaY: 8 })).toBe(
      null,
    );
    expect(actionForSwipe({ phase: "morning", deltaX: 4, deltaY: -120 })).toBe(
      null,
    );
  });
});
