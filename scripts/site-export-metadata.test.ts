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
      const privacyHtml = readFileSync(outFile("privacy/index.html"), "utf8");
      const termsHtml = readFileSync(outFile("terms/index.html"), "utf8");

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
      expect(privacyHtml).toContain(
        `rel="canonical" href="${SITE_URL}/privacy/"`,
      );
      expect(termsHtml).toContain(`rel="canonical" href="${SITE_URL}/terms/"`);
      expect(privacyHtml).toContain(
        `property="og:url" content="${SITE_URL}/privacy/"`,
      );
      expect(privacyHtml).toContain(
        'property="og:title" content="Privacy - Daybreak"',
      );
      expect(termsHtml).toContain(
        `property="og:url" content="${SITE_URL}/terms/"`,
      );
      expect(termsHtml).toContain(
        'property="og:title" content="Terms - Daybreak"',
      );
      expect(privacyHtml).toContain(
        'name="twitter:title" content="Privacy - Daybreak"',
      );
      expect(privacyHtml).toContain(
        'name="twitter:description" content="Daybreak privacy policy: local-only Windows commitment data, no account, no cloud sync, no telemetry."',
      );
      expect(termsHtml).toContain(
        'name="twitter:title" content="Terms - Daybreak"',
      );
      expect(termsHtml).toContain(
        'name="twitter:description" content="Daybreak terms for the Windows commitment app, one-time purchase, refunds, local-only app scope, and launch status."',
      );
      expect(indexHtml).toContain(
        `property="og:image" content="${SITE_URL}/daybreak-app.png"`,
      );
      expect(indexHtml).toContain(
        `name="twitter:image" content="${SITE_URL}/daybreak-app.png"`,
      );
      expect(indexHtml).toContain('name="theme-color" content="#0b1020"');
      expect(indexHtml).toContain('name="color-scheme" content="dark"');
      expect(indexHtml).toContain('class="hero-brand-art" aria-hidden="true"');
      expect(indexHtml).toContain('alt=""');
      expect(indexHtml).toContain(
        'alt="Daybreak Windows app showing a morning commitment ready to be wiped"',
      );
      expect(indexHtml).not.toContain("Generated Daybreak dawn swipe brand art");
      expect(indexHtml).toContain(
        "daybreak.rest serves the app over HTTPS on the apex and www hosts",
      );
      expect(indexHtml).not.toContain("GitHub Pages provisions HTTPS");
      expect(indexHtml).not.toContain("GitHub Pages HTTPS is pending");
      expect(indexHtml).not.toContain("GitHub Pages preview is online");
    },
    120000,
  );
});
