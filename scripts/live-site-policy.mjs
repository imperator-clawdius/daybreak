export const SUPPORT_MAILTO = "mailto:founder@daybreak.rest";
export const LEGAL_EFFECTIVE_DATE_PATTERN =
  /Effective\s*(?:<!-- -->)?\s*June 23, 2026/;

export const ALLOWED_HTTP_URLS = new Set([
  "http://www.sitemaps.org/schemas/sitemap/0.9",
  "http://www.w3.org/1998/Math/MathML",
  "http://www.w3.org/1999/xlink",
  "http://www.w3.org/2000/svg",
  "http://www.w3.org/XML/1998/namespace",
]);

export const FORBIDDEN_TRACKING_MARKERS = [
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

export const FORBIDDEN_PUBLIC_COPY = [
  {
    marker: "lifetime updates",
    reason: "unsupported_update_promise",
  },
  {
    marker: "GitHub Pages preview is online",
    reason: "stale_preview_status_copy",
  },
  {
    marker: "GitHub Pages provisions HTTPS",
    reason: "stale_https_status_copy",
  },
  {
    marker: "GitHub Pages HTTPS is pending",
    reason: "stale_https_status_copy",
  },
];

export function liveSurfaceIssue(body = "", allowedHosts = new Set()) {
  const lower = body.toLowerCase();
  for (const marker of FORBIDDEN_TRACKING_MARKERS) {
    if (lower.includes(marker)) {
      return `tracking_marker:${marker}`;
    }
  }

  for (const [url] of body.matchAll(/http:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}[^"'<>\\\s)]*/gi)) {
    if (!ALLOWED_HTTP_URLS.has(url)) {
      return `insecure_url:${url}`;
    }
  }

  for (const [url] of body.matchAll(/https:\/\/(?:[a-z0-9-]+\.)+[a-z]{2,}[^"'<>\\\s)]*/gi)) {
    const parsed = new URL(url);
    if (!allowedHosts.has(parsed.hostname)) {
      return `unexpected_host:${parsed.hostname}`;
    }
  }

  return null;
}

export function publicCopyIssue(body = "") {
  const lower = body.toLowerCase();
  for (const { marker, reason } of FORBIDDEN_PUBLIC_COPY) {
    if (lower.includes(marker.toLowerCase())) {
      return reason;
    }
  }

  return null;
}
