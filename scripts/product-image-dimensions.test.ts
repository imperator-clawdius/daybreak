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

  it("keeps generated brand art separate from the real app screenshot proof", () => {
    const hero = pngDimensions("site/public/daybreak-hero-bg.png");
    const page = readFileSync("site/app/page.tsx", "utf8");
    const layout = readFileSync("site/app/layout.tsx", "utf8");
    const site = readFileSync("site/app/site.ts", "utf8");

    expect(hero.width).toBeGreaterThanOrEqual(1600);
    expect(hero.height).toBeGreaterThanOrEqual(900);
    expect(page).toContain(`src={\`${"${basePath}"}/daybreak-hero-bg.png\`}`);
    expect(page).toContain(
      'alt="Generated Daybreak dawn swipe brand art"',
    );
    expect(site).toContain("daybreak-app.png");
    expect(site).not.toContain("daybreak-hero-bg.png");
    expect(layout).toContain("openGraph");
    expect(layout).toContain("twitter");
    expect(layout).not.toContain("daybreak-hero-bg.png");
  });
});
