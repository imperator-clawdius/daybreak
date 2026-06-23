import { lookup } from "node:dns/promises";

import { PRODUCTION_HOST, PRODUCTION_URL } from "./readiness-core.mjs";

export const PREVIEW_URL = "https://imperator-clawdius.github.io/daybreak/";
export const PRODUCTION_HTTP_URL = `http://${PRODUCTION_HOST}/`;
export const WWW_HOST = `www.${PRODUCTION_HOST}`;
export const WWW_URL = `https://${WWW_HOST}/`;
export const WWW_HTTP_URL = `http://${WWW_HOST}/`;
export const SUPPORT_MAILTO = "mailto:founder@daybreak.rest";
export const REQUIRED_ROUTES = [
  "privacy/",
  "terms/",
  "robots.txt",
  "sitemap.xml",
  "manifest.webmanifest",
  "icon.png",
  "apple-icon.png",
];

export function getPrimaryUrl(argv = []) {
  return argv[2] || PRODUCTION_URL;
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

function routePass(routeResult) {
  const body = routeResult.res.body ?? "";
  if (routeResult.route === "robots.txt") {
    return (
      routeResult.res.ok &&
      body.includes("Allow: /") &&
      body.includes(`Sitemap: ${PRODUCTION_URL}sitemap.xml`)
    );
  }

  if (routeResult.route === "sitemap.xml") {
    return (
      routeResult.res.ok &&
      body.includes(`<loc>${PRODUCTION_URL}</loc>`) &&
      body.includes(`<loc>${PRODUCTION_URL}privacy/</loc>`) &&
      body.includes(`<loc>${PRODUCTION_URL}terms/</loc>`)
    );
  }

  if (routeResult.route === "manifest.webmanifest") {
    if (!routeResult.res.ok) return false;

    try {
      const manifest = JSON.parse(body);
      return (
        manifest?.name === "Daybreak" &&
        manifest?.short_name === "Daybreak" &&
        manifest?.start_url === PRODUCTION_URL.replace(/\/$/, "") &&
        manifest?.scope === PRODUCTION_URL &&
        manifest?.background_color === "#0b1020" &&
        manifest?.theme_color === "#0b1020" &&
        Array.isArray(manifest?.icons) &&
        manifest.icons.some(
          (icon) =>
            icon?.src === `${PRODUCTION_URL}daybreak-app.png` &&
            icon?.type === "image/png",
        )
      );
    } catch {
      return false;
    }
  }

  if (routeResult.route === "icon.png" || routeResult.route === "apple-icon.png") {
    const bytes = routeResult.res.bytes;
    return (
      routeResult.res.ok &&
      Buffer.isBuffer(bytes) &&
      bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      bytes.toString("ascii", 1, 4) === "PNG"
    );
  }

  if (routeResult.route === "privacy/" || routeResult.route === "terms/") {
    return (
      routeResult.res.ok &&
      routeResult.res.hasApp &&
      routeResult.res.hasSupportContact
    );
  }

  return routeResult.res.ok && routeResult.res.hasApp;
}

function routesPass(routeResults) {
  return routeResults.every(routePass);
}

function formatRouteReport(label, routeResults) {
  const allPass = routesPass(routeResults);
  const routes = routeResults
    .map((routeResult) => {
      const res = routeResult.res;
      const state = routePass(routeResult) ? "pass" : "pending";
      return `${routeName(routeResult.route)}=${state}(${res.status})`;
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
    `LIVE_SITE=${primaryRes.ok ? "pass" : "FAIL"} status=${primaryRes.status} contains_daybreak=${primaryRes.hasApp ?? false} support_contact=${primaryRes.hasSupportContact ?? false}${
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
      `WWW_SITE=${wwwLive.ok ? "pass" : "pending"} status=${wwwLive.status} contains_daybreak=${wwwLive.hasApp ?? false} support_contact=${wwwLive.hasSupportContact ?? false}${
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
    primaryRes.hasSupportContact &&
    primaryRoutesOk;
  const wwwOk =
    wwwLive ? wwwLive.ok && wwwLive.hasApp && wwwLive.hasSupportContact : false;

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
