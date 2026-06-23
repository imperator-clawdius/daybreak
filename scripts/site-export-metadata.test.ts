import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const SITE_URL = "https://daybreak.rest";
const SUPPORT_EMAIL = "founder@daybreak.rest";
const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

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

function listStaticFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      return listStaticFiles(path);
    }
    return [path];
  });
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

describe("site static export metadata", () => {
  it(
    "publishes crawlable production metadata for the apex domain",
    () => {
      runNpm(["run", "build", "-w", "@daybreak/site"]);

      const robotsPath = outFile("robots.txt");
      const sitemapPath = outFile("sitemap.xml");
      const manifestPath = outFile("manifest.webmanifest");
      const iconPath = outFile("icon.png");
      const appleIconPath = outFile("apple-icon.png");
      const indexHtml = readFileSync(outFile("index.html"), "utf8");
      const notFoundHtml = readFileSync(outFile("404.html"), "utf8");
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

      expect(existsSync(manifestPath)).toBe(true);
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
        name?: string;
        short_name?: string;
        description?: string;
        start_url?: string;
        scope?: string;
        display?: string;
        background_color?: string;
        theme_color?: string;
        icons?: Array<{
          src?: string;
          sizes?: string;
          type?: string;
          purpose?: string;
        }>;
        categories?: string[];
      };
      expect(manifest).toMatchObject({
        name: "Daybreak",
        short_name: "Daybreak",
        start_url: SITE_URL,
        scope: `${SITE_URL}/`,
        display: "standalone",
        background_color: "#0b1020",
        theme_color: "#0b1020",
      });
      expect(manifest.description).toContain(
        "A Windows app that takes over your screen",
      );
      expect(manifest.icons).toEqual([
        {
          src: `${SITE_URL}/daybreak-app.png`,
          sizes: "1252x878",
          type: "image/png",
          purpose: "any",
        },
      ]);
      expect(manifest.categories).toEqual(["productivity"]);

      expect(indexHtml).toContain('rel="manifest" href="/manifest.webmanifest"');
      expect(pngDimensions(iconPath)).toEqual({ width: 256, height: 256 });
      expect(pngDimensions(appleIconPath)).toEqual({ width: 256, height: 256 });
      expect(indexHtml).toContain('rel="icon" href="/icon.png?');
      expect(indexHtml).toContain('rel="apple-touch-icon" href="/apple-icon.png?');
      expect(indexHtml).toContain('type="image/png" sizes="256x256"');
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
      for (const html of [indexHtml, notFoundHtml, privacyHtml, termsHtml]) {
        expect(html).toContain(`href="${SUPPORT_MAILTO}"`);
        expect(html).toContain(SUPPORT_EMAIL);
      }
      expect(indexHtml.match(new RegExp(`href="${SUPPORT_MAILTO}"`, "g"))).toHaveLength(2);
      expect(notFoundHtml).toContain("Page not found");
      expect(notFoundHtml).toContain("This Daybreak page does not exist");
      expect(notFoundHtml.match(new RegExp(`href="${SUPPORT_MAILTO}"`, "g"))).toHaveLength(1);
      expect(privacyHtml.match(new RegExp(`href="${SUPPORT_MAILTO}"`, "g"))).toHaveLength(1);
      expect(termsHtml.match(new RegExp(`href="${SUPPORT_MAILTO}"`, "g"))).toHaveLength(1);
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

      const inspectedFiles = listStaticFiles(outFile("")).filter((path) =>
        /\.(?:css|html|js|json|txt|webmanifest|xml)$/i.test(path),
      );
      const allowedHosts = new Set(["daybreak.rest", "www.daybreak.rest"]);
      const allowedDiagnosticHosts = new Set(["github.com", "nextjs.org", "react.dev"]);
      const allowedHttpUrls = new Set([
        "http://www.sitemaps.org/schemas/sitemap/0.9",
        "http://www.w3.org/1998/Math/MathML",
        "http://www.w3.org/1999/xlink",
        "http://www.w3.org/2000/svg",
        "http://www.w3.org/XML/1998/namespace",
      ]);
      const forbiddenTrackingMarkers = [
        "facebook.com/tr",
        "google-analytics.com",
        "googletagmanager",
        "gtag(",
        "hotjar",
        "intercom",
        "mixpanel",
        "plausible",
        "api.segment.io",
        "cdn.segment.com",
        "sentry",
      ];

      expect(inspectedFiles.length).toBeGreaterThan(0);
      for (const path of inspectedFiles) {
        const body = readFileSync(path, "utf8");
        const artifact = relative(outFile(""), path);

        for (const marker of forbiddenTrackingMarkers) {
          expect(body.toLowerCase(), `${artifact} contains ${marker}`).not.toContain(marker);
        }

        for (const [url] of body.matchAll(/http:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}[^"'<>\\\s)]*/gi)) {
          expect(allowedHttpUrls.has(url), `${artifact} links ${url}`).toBe(true);
        }

        for (const [url] of body.matchAll(/https:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}[^"'<>\\\s)]*/gi)) {
          const parsed = new URL(url);
          expect(
            allowedHosts.has(parsed.hostname) || allowedDiagnosticHosts.has(parsed.hostname),
            `${artifact} links ${url}`,
          ).toBe(true);
        }
      }
    },
    120000,
  );
});
