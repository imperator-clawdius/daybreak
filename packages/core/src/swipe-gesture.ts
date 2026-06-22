import type { Phase, WipeAction } from "./model.js";

const DEFAULT_THRESHOLD = 80;

export interface SwipeInput {
  phase: Phase;
  deltaX: number;
  deltaY: number;
  threshold?: number;
}

export function actionForSwipe(input: SwipeInput): WipeAction | null {
  const threshold = input.threshold ?? DEFAULT_THRESHOLD;
  const absX = Math.abs(input.deltaX);
  const absY = Math.abs(input.deltaY);

  if (absX < threshold && absY < threshold) return null;

  if (absX >= absY) {
    return input.deltaX > 0
      ? input.phase === "morning"
        ? "commit"
        : "done"
      : "kill";
  }

  return input.deltaY > 0 ? "defer" : null;
}
