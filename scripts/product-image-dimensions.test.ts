import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function pngDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

describe("product image dimensions", () => {
  it("keeps the real app capture wide enough for all wipe controls and aligned with site metadata", () => {
    const image = pngDimensions("site/public/daybreak-app.png");
    const page = readFileSync("site/app/page.tsx", "utf8");
    const layout = readFileSync("site/app/layout.tsx", "utf8");

    expect(image.width).toBeGreaterThanOrEqual(1200);
    expect(image.height).toBeGreaterThanOrEqual(750);
    expect(page).toContain(`width={${image.width}}`);
    expect(page).toContain(`height={${image.height}}`);
    expect(layout).toContain(`width: ${image.width}`);
    expect(layout).toContain(`height: ${image.height}`);
  });
});
