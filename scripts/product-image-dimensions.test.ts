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
  expect(bytes[0]).toBe(0x89);
  expect(bytes.toString("ascii", 1, 4)).toBe("PNG");
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function icoPngEntries(path: string): Array<{ width: number; height: number }> {
  const bytes = readFileSync(path);
  expect(bytes.readUInt16LE(0)).toBe(0);
  expect(bytes.readUInt16LE(2)).toBe(1);
  const count = bytes.readUInt16LE(4);
  const entries: Array<{ width: number; height: number }> = [];

  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16;
    const width = bytes[offset] || 256;
    const height = bytes[offset + 1] || 256;
    const size = bytes.readUInt32LE(offset + 8);
    const imageOffset = bytes.readUInt32LE(offset + 12);
    const image = bytes.subarray(imageOffset, imageOffset + size);
    expect(image[0]).toBe(0x89);
    expect(image.toString("ascii", 1, 4)).toBe("PNG");
    entries.push({ width, height });
  }

  return entries;
}

describe("product image dimensions", () => {
  it("keeps the real app capture wide enough for all wipe controls and aligned with site metadata", () => {
    const image = pngDimensions("site/public/daybreak-app.png");
    const page = readFileSync("site/app/page.tsx", "utf8");
    const layout = readFileSync("site/app/layout.tsx", "utf8");
    const privacy = readFileSync("site/app/privacy/page.tsx", "utf8");
    const terms = readFileSync("site/app/terms/page.tsx", "utf8");

    expect(image.width).toBeGreaterThanOrEqual(1200);
    expect(image.height).toBeGreaterThanOrEqual(750);
    for (const source of [layout, privacy, terms]) {
      expect(source).toContain(`width: ${image.width}`);
      expect(source).toContain(`height: ${image.height}`);
    }
    expect(page).toContain(`width={${image.width}}`);
    expect(page).toContain(`height={${image.height}}`);
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
    expect(page).toContain('<figure className="hero-brand-art" aria-hidden="true">');
    expect(page).toContain('alt=""');
    expect(site).toContain("daybreak-app.png");
    expect(site).not.toContain("daybreak-hero-bg");
    expect(layout).toContain("openGraph");
    expect(layout).toContain("twitter");
    expect(layout).not.toContain("daybreak-hero-bg");
  });

  it("keeps browser and Windows app icons synchronized", () => {
    const siteIcon = readFileSync("site/app/icon.png");
    const appleIcon = readFileSync("site/app/apple-icon.png");
    const desktopIcon = readFileSync("desktop/assets/icon.png");

    expect(pngDimensions("site/app/icon.png")).toEqual({ width: 256, height: 256 });
    expect(pngDimensions("site/app/apple-icon.png")).toEqual({
      width: 256,
      height: 256,
    });
    expect(pngDimensions("desktop/assets/icon.png")).toEqual({
      width: 256,
      height: 256,
    });
    expect(appleIcon.equals(siteIcon)).toBe(true);
    expect(desktopIcon.equals(siteIcon)).toBe(true);
    expect(icoPngEntries("desktop/assets/icon.ico")).toEqual([
      { width: 256, height: 256 },
      { width: 128, height: 128 },
      { width: 64, height: 64 },
      { width: 48, height: 48 },
      { width: 32, height: 32 },
      { width: 16, height: 16 },
    ]);
  });
});
