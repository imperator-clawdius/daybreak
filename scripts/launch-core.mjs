import { lookup } from "node:dns/promises";

import { PRODUCTION_HOST, PRODUCTION_URL } from "./readiness-core.mjs";

export const PREVIEW_URL = "https://imperator-clawdius.github.io/daybreak/";

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
    return { ok: res.ok, status: res.status, hasApp: /Daybreak/.test(body) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
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
  apexHost,
  apexDns,
  apexLive,
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
  lines.push(`APEX_DNS host=${apexHost} resolves=${apexDns}`);
  if (apexLive) {
    lines.push(
      `APEX_SITE=${apexLive.ok ? "pass" : "pending"} status=${apexLive.status}${
        apexLive.error ? ` error=${apexLive.error}` : ""
      }`,
    );
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
  const primaryRes = await fetchSite(primary, fetchImpl);
  const previewRes = await fetchSite(PREVIEW_URL, fetchImpl);

  return {
    ok: primaryRes.ok,
    text: renderLaunchReport({
      primary,
      primaryRes,
      previewRes,
      apexHost: PRODUCTION_HOST,
      apexDns,
      apexLive,
    }),
  };
}
