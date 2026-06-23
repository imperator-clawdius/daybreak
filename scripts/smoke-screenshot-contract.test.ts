import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("desktop smoke screenshot contract", () => {
  it("stabilizes swipe visuals before capturing the public app image", () => {
    const source = readFileSync("desktop/src/main/main.ts", "utf8");
    const stabilizeCall = source.indexOf("await stabilizeSmokeScreenshot()");
    const captureCall = source.indexOf("capturePage()");

    expect(stabilizeCall).toBeGreaterThan(-1);
    expect(captureCall).toBeGreaterThan(-1);
    expect(stabilizeCall).toBeLessThan(captureCall);
  });
});
