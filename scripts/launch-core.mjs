import { lookup } from "node:dns/promises";

import { PRODUCTION_HOST, PRODUCTION_URL } from "./readiness-core.mjs";

export const PREVIEW_URL = "https://imperator-clawdius.github.io/daybreak/";
export const PRODUCTION_HTTP_URL = `http://${PRODUCTION_HOST}/`;
export const WWW_HOST = `www.${PRODUCTION_HOST}`;
export const WWW_URL = `https://${WWW_HOST}/`;
export const WWW_HTTP_URL = `http://${WWW_HOST}/`;
export const SUPPORT_MAILTO = "mailto:founder@daybreak.rest";
export const LEGAL_EFFECTIVE_DATE_PATTERN =
  /Effective\s*(?:<!-- -->)?\s*June 23, 2026/;
export const ALLOWED_LIVE_HOSTS = new Set([PRODUCTION_HOST, WWW_HOST]);
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
export const REQUIRED_ROUTES = [
  "privacy/",
  "terms/",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "icon.png",
  "apple-icon.png",
  "missing-page",
];

export function getPrimaryUrl(argv = []) {
  return argv[2] || PRODUCTION_URL;
}

export function liveSurfaceIssue(body = "") {
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
    if (!ALLOWED_LIVE_HOSTS.has(parsed.hostname)) {
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

function formatFetchError(error) {
  const message = String(error?.message || error);
  const cause = error?.cause;
  if (!cause || typeof cause !== "object") {
    return message;
  }

  const causeCode = typeof cause.code === "string" ? cause.code : "";
  const causeMessage =
    typeof cause.message === "string" && cause.message !== message
      ? cause.message
      : "";
  const detail = [causeCode, causeMessage].filter(Boolean).join(": ");
  return detail ? `${message} cause=${detail}` : message;
}

export async function fetchSite(
  url,
  fetchImpl = fetch,
  { redirect = "follow" } = {},
) {
  try {
    // connection: close avoids a keep-alive socket lingering into interpreter
    // teardown (a libuv assertion crash on Windows when process.exit races it).
    const res = await fetchImpl(url, {
      method: "GET",
      redirect,
      headers: { connection: "close" },
    });
    const bytes =
      typeof res.arrayBuffer === "function"
        ? Buffer.from(await res.arrayBuffer())
        : null;
    const body = bytes ? new TextDecoder().decode(bytes) : await res.text();
    return {
      ok: res.ok,
      status: res.status,
      hasApp: /Daybreak/.test(body),
      hasSupportContact: body.includes(`href="${SUPPORT_MAILTO}"`),
      surfaceIssue: liveSurfaceIssue(body),
      publicCopyIssue: publicCopyIssue(body),
      body,
      bytes,
    };
  } catch (e) {
    return { ok: false, status: 0, error: formatFetchError(e) };
  }
}

function routeUrl(baseUrl, route) {
  return new URL(route, baseUrl).href;
}

export async function fetchRequiredRoutes(
  baseUrl,
  fetchImpl = fetch,
  options = {},
) {
  return Promise.all(
    REQUIRED_ROUTES.map(async (route) => ({
      route,
      res: await fetchSite(routeUrl(baseUrl, route), fetchImpl, options),
    })),
  );
}

function routeName(route) {
  return route.replace(/\/$/, "");
}

function routeIssue(routeResult) {
  const body = routeResult.res.body ?? "";
  if (routeResult.route === "robots.txt") {
    if (!routeResult.res.ok) return `status_${routeResult.res.status}`;
    if (!body.includes("Allow: /")) return "robots_missing_allow";
    if (!body.includes(`Sitemap: ${PRODUCTION_URL}sitemap.xml`)) {
      return "robots_missing_sitemap";
    }
    return null;
  }

  if (routeResult.route === "sitemap.xml") {
    if (!routeResult.res.ok) return `status_${routeResult.res.status}`;
    if (!body.includes(`<loc>${PRODUCTION_URL}</loc>`)) {
      return "sitemap_missing_home";
    }
    if (!body.includes(`<loc>${PRODUCTION_URL}privacy/</loc>`)) {
      return "sitemap_missing_privacy";
    }
    if (!body.includes(`<loc>${PRODUCTION_URL}terms/</loc>`)) {
      return "sitemap_missing_terms";
    }
    return null;
  }

  if (routeResult.route === "manifest.webmanifest") {
    if (!routeResult.res.ok) return `status_${routeResult.res.status}`;

    try {
      const manifest = JSON.parse(body);
      const valid =
        manifest?.name === "Daybreak" &&
        manifest?.short_name === "Daybreak" &&
        manifest?.start_url === PRODUCTION_URL.replace(/\/$/, "") &&
        manifest?.scope === PRODUCTION_URL &&
        manifest?.background_color === "#0b1020" &&
        manifest?.theme_color === "#0b1020" &&
        Array.isArray(manifest?.icons) &&
        manifest.icons.some(
          (icon) =>
            icon?.src === `${PRODUCTION_URL}icon.png` &&
            icon?.sizes === "256x256" &&
            icon?.type === "image/png",
        );
      return valid ? null : "manifest_malformed";
    } catch {
      return "manifest_invalid_json";
    }
  }

  if (routeResult.route === "icon.png" || routeResult.route === "apple-icon.png") {
    const bytes = routeResult.res.bytes;
    if (!routeResult.res.ok) return `status_${routeResult.res.status}`;
    const validPng =
      routeResult.res.ok &&
      Buffer.isBuffer(bytes) &&
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      bytes.toString("ascii", 1, 4) === "PNG";
    return validPng ? null : "not_png";
  }

  if (routeResult.route === "missing-page") {
    if (routeResult.res.status !== 404) return `status_${routeResult.res.status}`;
    if (!routeResult.res.hasApp) return "missing_daybreak";
    if (!routeResult.res.hasSupportContact) return "missing_support_contact";
    if (routeResult.res.surfaceIssue) return routeResult.res.surfaceIssue;
    if (routeResult.res.publicCopyIssue) return routeResult.res.publicCopyIssue;
    return null;
  }

  if (routeResult.route === "privacy/" || routeResult.route === "terms/") {
    if (!routeResult.res.ok) return `status_${routeResult.res.status}`;
    if (!routeResult.res.hasApp) return "missing_daybreak";
    if (!routeResult.res.hasSupportContact) return "missing_support_contact";
    if (routeResult.res.surfaceIssue) return routeResult.res.surfaceIssue;
    if (routeResult.res.publicCopyIssue) return routeResult.res.publicCopyIssue;
    if (!LEGAL_EFFECTIVE_DATE_PATTERN.test(body)) {
      return "missing_legal_effective_date";
    }
    return null;
  }

  if (!routeResult.res.ok) return `status_${routeResult.res.status}`;
  if (!routeResult.res.hasApp) return "missing_daybreak";
  if (routeResult.res.surfaceIssue) return routeResult.res.surfaceIssue;
  if (routeResult.res.publicCopyIssue) return routeResult.res.publicCopyIssue;
  return null;
}

function routePass(routeResult) {
  return routeIssue(routeResult) === null;
}

function routesPass(routeResults) {
  return routeResults.every(routePass);
}

function formatRouteReport(label, routeResults) {
  const allPass = routesPass(routeResults);
  const routes = routeResults
    .map((routeResult) => {
      const res = routeResult.res;
      const issue = routeIssue(routeResult);
      const state = issue ? "pending" : "pass";
      const issueSuffix = issue ? `:${issue}` : "";
      return `${routeName(routeResult.route)}=${state}(${res.status}${issueSuffix})`;
    })
    .join(" ");
  return `${label}=${allPass ? "pass" : "pending"} ${routes}`;
}

function normalizeAddresses(addresses) {
  return addresses
    .map((address) =>
      typeof address === "string" ? address : String(address.address || ""),
    )
    .filter(Boolean);
}

export async function resolveHost(host, lookupImpl = lookup) {
  try {
    return normalizeAddresses(await lookupImpl(host, { all: true })).join(",");
  } catch {
    return "unresolved";
  }
}

export function renderLaunchReport({
  primary,
  primaryRes,
  previewRes,
  apexHttpRes,
  previewRoutes,
  apexHttpRoutes,
  apexHost,
  apexDns,
  apexLive,
  apexRoutes,
  wwwHost,
  wwwDns,
  wwwHttpRes,
  wwwHttpRoutes,
  wwwLive,
  wwwRoutes,
}) {
  const lines = [];
  lines.push(`PRIMARY ${primary}`);
  lines.push(
    `LIVE_SITE=${primaryRes.ok ? "pass" : "FAIL"} status=${primaryRes.status} contains_daybreak=${primaryRes.hasApp ?? false} support_contact=${primaryRes.hasSupportContact ?? false} surface_clean=${!primaryRes.surfaceIssue} copy_clean=${!primaryRes.publicCopyIssue}${
      primaryRes.surfaceIssue ? ` surface_issue=${primaryRes.surfaceIssue}` : ""
    }${
      primaryRes.publicCopyIssue ? ` copy_issue=${primaryRes.publicCopyIssue}` : ""
    }${
      primaryRes.error ? ` error=${primaryRes.error}` : ""
    }`,
  );
  lines.push(
    `PREVIEW_SITE=${previewRes.ok ? "pass" : "pending"} status=${previewRes.status} contains_daybreak=${previewRes.hasApp ?? false} support_contact=${previewRes.hasSupportContact ?? false}${
      previewRes.error ? ` error=${previewRes.error}` : ""
    }`,
  );
  lines.push(formatRouteReport("PREVIEW_ROUTES", previewRoutes));
  lines.push(
    `APEX_HTTP_SITE=${apexHttpRes.ok ? "pass" : "pending"} status=${apexHttpRes.status} contains_daybreak=${apexHttpRes.hasApp ?? false} support_contact=${apexHttpRes.hasSupportContact ?? false}${
      apexHttpRes.error ? ` error=${apexHttpRes.error}` : ""
    }`,
  );
  lines.push(formatRouteReport("APEX_HTTP_ROUTES", apexHttpRoutes));
  lines.push(`APEX_DNS host=${apexHost} resolves=${apexDns}`);
  if (apexLive) {
    lines.push(
      `APEX_SITE=${apexLive.ok ? "pass" : "pending"} status=${apexLive.status}${
        apexLive.error ? ` error=${apexLive.error}` : ""
      }`,
    );
    lines.push(formatRouteReport("APEX_ROUTES", apexRoutes));
  } else {
    lines.push(
      `APEX_SITE=pending reason=dns_or_pages_not_ready (point ${apexHost} at GitHub Pages and wait for HTTPS)`,
    );
  }
  lines.push(
    `WWW_HTTP_SITE=${wwwHttpRes.ok ? "pass" : "pending"} status=${wwwHttpRes.status} contains_daybreak=${wwwHttpRes.hasApp ?? false}${
      wwwHttpRes.error ? ` error=${wwwHttpRes.error}` : ""
    }`,
  );
  lines.push(formatRouteReport("WWW_HTTP_ROUTES", wwwHttpRoutes));
  lines.push(`WWW_DNS host=${wwwHost} resolves=${wwwDns}`);
  if (wwwLive) {
    lines.push(
      `WWW_SITE=${wwwLive.ok ? "pass" : "pending"} status=${wwwLive.status} contains_daybreak=${wwwLive.hasApp ?? false} support_contact=${wwwLive.hasSupportContact ?? false} surface_clean=${!wwwLive.surfaceIssue} copy_clean=${!wwwLive.publicCopyIssue}${
        wwwLive.surfaceIssue ? ` surface_issue=${wwwLive.surfaceIssue}` : ""
      }${
        wwwLive.publicCopyIssue ? ` copy_issue=${wwwLive.publicCopyIssue}` : ""
      }${
        wwwLive.error ? ` error=${wwwLive.error}` : ""
      }`,
    );
    lines.push(formatRouteReport("WWW_ROUTES", wwwRoutes));
  } else {
    lines.push(
      `WWW_SITE=pending reason=dns_or_pages_not_ready (point ${wwwHost} at GitHub Pages and wait for HTTPS)`,
    );
  }

  return lines.join("\n");
}

export async function verifyLaunch({
  argv = process.argv,
  fetchImpl = fetch,
  lookupImpl = lookup,
} = {}) {
  const primary = getPrimaryUrl(argv);
  const apexDns = await resolveHost(PRODUCTION_HOST, lookupImpl);
  const wwwDns = await resolveHost(WWW_HOST, lookupImpl);
  const apexLive =
    apexDns !== "unresolved"
      ? await fetchSite(PRODUCTION_URL, fetchImpl)
      : null;
  const wwwLive =
    wwwDns !== "unresolved" ? await fetchSite(WWW_URL, fetchImpl) : null;
  const wwwRoutes =
    wwwDns !== "unresolved"
      ? await fetchRequiredRoutes(WWW_URL, fetchImpl)
      : null;
  const apexRoutes =
    apexDns !== "unresolved"
      ? await fetchRequiredRoutes(PRODUCTION_URL, fetchImpl)
      : null;
  const primaryRes = await fetchSite(primary, fetchImpl, {
    redirect: primary === PREVIEW_URL ? "manual" : "follow",
  });
  const previewRes = await fetchSite(PREVIEW_URL, fetchImpl, {
    redirect: "manual",
  });
  const previewRoutes = await fetchRequiredRoutes(PREVIEW_URL, fetchImpl, {
    redirect: "manual",
  });
  const apexHttpRes = await fetchSite(PRODUCTION_HTTP_URL, fetchImpl);
  const apexHttpRoutes = await fetchRequiredRoutes(PRODUCTION_HTTP_URL, fetchImpl);
  const wwwHttpRes = await fetchSite(WWW_HTTP_URL, fetchImpl);
  const wwwHttpRoutes = await fetchRequiredRoutes(WWW_HTTP_URL, fetchImpl);
  const primaryRoutes =
    primary === PRODUCTION_URL
      ? apexRoutes
      : primary === PREVIEW_URL
        ? previewRoutes
        : await fetchRequiredRoutes(primary, fetchImpl);
  const primaryRoutesOk = primaryRoutes ? routesPass(primaryRoutes) : false;
  const primaryOk =
    primaryRes.ok &&
    primaryRes.hasApp &&
    primaryRes.hasSupportContact &&
    !primaryRes.surfaceIssue &&
    !primaryRes.publicCopyIssue &&
    primaryRoutesOk;
  const wwwOk =
    wwwLive
      ? wwwLive.ok &&
        wwwLive.hasApp &&
        wwwLive.hasSupportContact &&
        !wwwLive.surfaceIssue &&
        !wwwLive.publicCopyIssue
      : false;

  return {
    ok: primaryOk && (primary === PRODUCTION_URL ? wwwOk : true),
    text: renderLaunchReport({
      primary,
      primaryRes,
      previewRes,
      apexHttpRes,
      previewRoutes,
      apexHttpRoutes,
      apexHost: PRODUCTION_HOST,
      apexDns,
      apexLive,
      apexRoutes,
      wwwHost: WWW_HOST,
      wwwDns,
      wwwHttpRes,
      wwwHttpRoutes,
      wwwLive,
      wwwRoutes,
    }),
  };
}
