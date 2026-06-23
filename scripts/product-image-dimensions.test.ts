import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

function imageDimensions(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  if (bytes[0] === 0x89 && bytes.toString("ascii", 1, 4) === "PNG") {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset < bytes.length - 9;) {
      if (bytes[offset] !== 0xff) break;
      const marker = bytes[offset + 1];
      const length = bytes.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          height: bytes.readUInt16BE(offset + 5),
          width: bytes.readUInt16BE(offset + 7),
        };
      }
      offset += 2 + length;
    }
  }

  throw new Error(`Unsupported image format: ${path}`);
}

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
    const heroPath = "site/public/daybreak-hero-bg.jpg";
    const hero = imageDimensions(heroPath);
    const page = readFileSync("site/app/page.tsx", "utf8");
    const layout = readFileSync("site/app/layout.tsx", "utf8");
    const site = readFileSync("site/app/site.ts", "utf8");

    expect(hero.width).toBeGreaterThanOrEqual(1600);
    expect(hero.height).toBeGreaterThanOrEqual(900);
    expect(statSync(heroPath).size).toBeLessThanOrEqual(450_000);
    expect(page).toContain(`src={\`${"${basePath}"}/daybreak-hero-bg.jpg\`}`);
    expect(page).toContain(
      'alt="Generated Daybreak dawn swipe brand art"',
    );
    expect(site).toContain("daybreak-app.png");
    expect(site).not.toContain("daybreak-hero-bg");
    expect(layout).toContain("openGraph");
    expect(layout).toContain("twitter");
    expect(layout).not.toContain("daybreak-hero-bg");
  });
});
