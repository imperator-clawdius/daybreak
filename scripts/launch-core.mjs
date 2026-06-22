import { lookup } from "node:dns/promises";

import { PRODUCTION_HOST, PRODUCTION_URL } from "./readiness-core.mjs";

export const PREVIEW_URL = "https://imperator-clawdius.github.io/daybreak/";
export const PRODUCTION_HTTP_URL = `http://${PRODUCTION_HOST}/`;
export const REQUIRED_ROUTES = [
  "privacy/",
  "terms/",
  "robots.txt",
  "sitemap.xml",
];

export function getPrimaryUrl(argv = []) {
  return argv[2] || PRODUCTION_URL;
}

export async function fetchSite(url, fetchImpl = fetch) {
  try {
    // connection: close avoids a keep-alive socket lingering into interpreter
    // teardown (a libuv assertion crash on Windows when process.exit races it).
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { connection: "close" },
    });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      hasApp: /Daybreak/.test(body),
      body,
    };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

function routeUrl(baseUrl, route) {
  return new URL(route, baseUrl).href;
}

export async function fetchRequiredRoutes(baseUrl, fetchImpl = fetch) {
  return Promise.all(
    REQUIRED_ROUTES.map(async (route) => ({
      route,
      res: await fetchSite(routeUrl(baseUrl, route), fetchImpl),
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
}) {
  const lines = [];
  lines.push(`PRIMARY ${primary}`);
  lines.push(
    `LIVE_SITE=${primaryRes.ok ? "pass" : "FAIL"} status=${primaryRes.status} contains_daybreak=${primaryRes.hasApp ?? false}${
      primaryRes.error ? ` error=${primaryRes.error}` : ""
    }`,
  );
  lines.push(
    `PREVIEW_SITE=${previewRes.ok ? "pass" : "pending"} status=${previewRes.status} contains_daybreak=${previewRes.hasApp ?? false}${
      previewRes.error ? ` error=${previewRes.error}` : ""
    }`,
  );
  lines.push(formatRouteReport("PREVIEW_ROUTES", previewRoutes));
  lines.push(
    `APEX_HTTP_SITE=${apexHttpRes.ok ? "pass" : "pending"} status=${apexHttpRes.status} contains_daybreak=${apexHttpRes.hasApp ?? false}${
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

  return lines.join("\n");
}

export async function verifyLaunch({
  argv = process.argv,
  fetchImpl = fetch,
  lookupImpl = lookup,
} = {}) {
  const primary = getPrimaryUrl(argv);
  const apexDns = await resolveHost(PRODUCTION_HOST, lookupImpl);
  const apexLive =
    apexDns !== "unresolved"
      ? await fetchSite(PRODUCTION_URL, fetchImpl)
      : null;
  const apexRoutes =
    apexDns !== "unresolved"
      ? await fetchRequiredRoutes(PRODUCTION_URL, fetchImpl)
      : null;
  const primaryRes = await fetchSite(primary, fetchImpl);
  const previewRes = await fetchSite(PREVIEW_URL, fetchImpl);
  const previewRoutes = await fetchRequiredRoutes(PREVIEW_URL, fetchImpl);
  const apexHttpRes = await fetchSite(PRODUCTION_HTTP_URL, fetchImpl);
  const apexHttpRoutes = await fetchRequiredRoutes(PRODUCTION_HTTP_URL, fetchImpl);
  const primaryRoutes =
    primary === PRODUCTION_URL
      ? apexRoutes
      : primary === PREVIEW_URL
        ? previewRoutes
        : await fetchRequiredRoutes(primary, fetchImpl);
  const primaryRoutesOk = primaryRoutes ? routesPass(primaryRoutes) : false;

  return {
    ok: primaryRes.ok && primaryRoutesOk,
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
    }),
  };
}
