import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_URL = "https://daybreak.rest";

function runNpm(args: string[]): void {
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", ["npm", ...args].join(" ")], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return;
  }

  execFileSync("npm", args, {
    cwd: process.cwd(),
    stdio: "pipe",
  });
}

function outFile(path: string): string {
  return join(process.cwd(), "site", "out", path);
}

describe("site static export metadata", () => {
  it(
    "publishes crawlable production metadata for the apex domain",
    () => {
      runNpm(["run", "build", "-w", "@daybreak/site"]);

      const robotsPath = outFile("robots.txt");
      const sitemapPath = outFile("sitemap.xml");
      const indexHtml = readFileSync(outFile("index.html"), "utf8");

      expect(existsSync(robotsPath)).toBe(true);
      expect(readFileSync(robotsPath, "utf8")).toContain(
        `Sitemap: ${SITE_URL}/sitemap.xml`,
      );

      expect(existsSync(sitemapPath)).toBe(true);
      const sitemap = readFileSync(sitemapPath, "utf8");
      expect(sitemap).toContain(`<loc>${SITE_URL}/</loc>`);
      expect(sitemap).toContain(`<loc>${SITE_URL}/privacy/</loc>`);
      expect(sitemap).toContain(`<loc>${SITE_URL}/terms/</loc>`);

      expect(indexHtml).toContain(`rel="canonical" href="${SITE_URL}/"`);
      expect(indexHtml).toContain(
        `property="og:image" content="${SITE_URL}/daybreak-app.png"`,
      );
      expect(indexHtml).toContain(
        `name="twitter:image" content="${SITE_URL}/daybreak-app.png"`,
      );
      expect(indexHtml).toContain(
        "daybreak.rest serves the app over HTTP while GitHub Pages provisions HTTPS",
      );
      expect(indexHtml).not.toContain("GitHub Pages preview is online");
    },
    120000,
  );
});
