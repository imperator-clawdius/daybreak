import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { getDesktopContentSecurityPolicy } from "../packages/core/src/desktop-shell";

function desktopRendererHtml(): string {
  return readFileSync(
    join(process.cwd(), "desktop", "src", "renderer", "index.html"),
    "utf8",
  );
}

describe("desktop renderer security headers", () => {
  it("ships the strict core-owned content security policy", () => {
    const html = desktopRendererHtml();
    const expectedPolicy = getDesktopContentSecurityPolicy();

    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(html).toContain(`content="${expectedPolicy}"`);
  });
});
