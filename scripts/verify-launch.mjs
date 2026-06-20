#!/usr/bin/env node
// Daybreak launch verifier — mirrors TraceReady's verify:launch.
// Hits the live site over HTTPS and reports real status codes. It checks the
// GitHub Pages preview by default and the apex domain when it resolves.
// Exit 0 only if the primary live URL returns 200.
//
// Override the target with: node scripts/verify-launch.mjs <url>

import { lookup } from "node:dns/promises";

const PREVIEW = "https://imperator-clawdius.github.io/daybreak/";
const APEX = "https://daybreakdesk.com/";

const primary = process.argv[2] || PREVIEW;

async function head(url) {
  try {
    const res = await fetch(url, { method: "GET", redirect: "follow" });
    const body = await res.text();
    return { ok: res.ok, status: res.status, hasApp: /Daybreak/.test(body) };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

async function dns(host) {
  try {
    const r = await lookup(host, { all: true });
    return r.map((a) => a.address).join(",");
  } catch {
    return "unresolved";
  }
}

const apexHost = "daybreakdesk.com";
const apexDns = await dns(apexHost);
const apexLive = apexDns !== "unresolved" ? await head(APEX) : null;
const primaryRes = await head(primary);

console.log(`PRIMARY ${primary}`);
console.log(
  `LIVE_SITE=${primaryRes.ok ? "pass" : "FAIL"} status=${primaryRes.status} contains_daybreak=${primaryRes.hasApp ?? false}${
    primaryRes.error ? ` error=${primaryRes.error}` : ""
  }`,
);
console.log(`APEX_DNS host=${apexHost} resolves=${apexDns}`);
if (apexLive) {
  console.log(
    `APEX_SITE=${apexLive.ok ? "pass" : "pending"} status=${apexLive.status}`,
  );
} else {
  console.log(
    "APEX_SITE=pending reason=domain_not_purchased_or_dns_unset (buy daybreakdesk.com on Namecheap)",
  );
}

process.exit(primaryRes.ok ? 0 : 1);
