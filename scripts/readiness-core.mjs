import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import { join } from "node:path";

export const PRODUCTION_HOST = "daybreak.rest";
export const PRODUCTION_URL = `https://${PRODUCTION_HOST}/`;
export const GITHUB_PAGES_IPV4 = [
  "185.199.108.153",
  "185.199.109.153",
  "185.199.110.153",
  "185.199.111.153",
];

export function readText(root, relativePath) {
  try {
    return readFileSync(join(root, relativePath), "utf8");
  } catch {
    return "";
  }
}

export function extractConfigUrl(configSrc, exportName) {
  const pattern = new RegExp(
    `export\\s+const\\s+${exportName}\\s*=\\s*["']([^"']+)["']`,
  );
  return pattern.exec(configSrc)?.[1] ?? "";
}

function isHttpsUrl(url) {
  return /^https:\/\//.test(url);
}

function isStripePaymentLink(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && parsed.hostname === "buy.stripe.com";
  } catch {
    return false;
  }
}

function isSha256(value) {
  return /^[a-f0-9]{64}$/i.test(value);
}

async function fetchProof(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      method: "HEAD",
      redirect: "follow",
      headers: { connection: "close" },
    });
    if (res.status === 405 || res.status === 403) {
      const fallback = await fetchImpl(url, {
        method: "GET",
        redirect: "follow",
        headers: { connection: "close", range: "bytes=0-0" },
      });
      return { ok: fallback.ok, status: fallback.status };
    }
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

async function fetchAndHash(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { connection: "close" },
    });
    if (!res.ok) {
      return { ok: false, status: res.status };
    }

    const bytes = Buffer.from(await res.arrayBuffer());
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    return { ok: true, status: res.status, sha256 };
  } catch (e) {
    return { ok: false, status: 0, error: String(e.message || e) };
  }
}

async function defaultLookup(host) {
  const results = await lookup(host, { all: true, family: 4 });
  return results.map((result) => result.address);
}

function normalizeAddresses(addresses) {
  return addresses
    .map((address) =>
      typeof address === "string" ? address : String(address.address || ""),
    )
    .filter(Boolean);
}

async function fetchSite(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: { connection: "close" },
    });
    const body = await res.text();
    return { ok: res.ok, status: res.status, hasApp: /Daybreak/.test(body) };
  } catch (e) {
    return { ok: false, status: 0, hasApp: false, error: String(e.message || e) };
  }
}

export async function evaluateProductionDomain({
  host = PRODUCTION_HOST,
  url = PRODUCTION_URL,
  lookupImpl = defaultLookup,
  fetchImpl = fetch,
}) {
  let addresses = [];
  try {
    addresses = normalizeAddresses(await lookupImpl(host));
  } catch (e) {
    return {
      pass: false,
      reason: "dns_unresolved",
      detail: `${host} unresolved (${String(e.message || e)})`,
    };
  }

  if (addresses.length === 0) {
    return {
      pass: false,
      reason: "dns_unresolved",
      detail: `${host} unresolved`,
    };
  }

  const missing = GITHUB_PAGES_IPV4.filter(
    (address) => !addresses.includes(address),
  );
  const extra = addresses.filter(
    (address) => !GITHUB_PAGES_IPV4.includes(address),
  );
  if (missing.length || extra.length) {
    return {
      pass: false,
      reason: "dns_missing_github_pages_records",
      detail: `${host} resolves to ${addresses.join(",")}; expected ${GITHUB_PAGES_IPV4.join(",")}`,
    };
  }

  const site = await fetchSite(url, fetchImpl);
  if (!site.ok || !site.hasApp) {
    return {
      pass: false,
      reason: "apex_http_not_ready",
      status: site.status,
      detail: `HTTP ${site.status || "error"} contains_daybreak=${site.hasApp}${
        site.error ? ` error=${site.error}` : ""
      }`,
      error: site.error,
    };
  }

  return {
    pass: true,
    status: site.status,
    detail: `DNS A records resolved to GitHub Pages and apex returned HTTP ${site.status}`,
  };
}

export async function evaluateExternalLink({
  kind,
  url,
  expectedSha256 = "",
  fetchImpl = fetch,
}) {
  if (!isHttpsUrl(url)) {
    return { pass: false, reason: "not_configured", detail: "not configured" };
  }

  if (kind === "checkout" && !isStripePaymentLink(url)) {
    return {
      pass: false,
      reason: "not_stripe_payment_link",
      detail: "configured URL is not a buy.stripe.com Payment Link",
    };
  }

  if (kind === "download") {
    if (!isSha256(expectedSha256)) {
      return {
        pass: false,
        reason: "checksum_not_configured",
        detail: "installer checksum not configured",
      };
    }

    const proof = await fetchAndHash(url, fetchImpl);
    if (!proof.ok) {
      return {
        pass: false,
        reason: "http_not_ok",
        status: proof.status,
        detail: `HTTP ${proof.status || "error"}`,
        error: proof.error,
      };
    }

    if (proof.sha256.toLowerCase() !== expectedSha256.toLowerCase()) {
      return {
        pass: false,
        reason: "checksum_mismatch",
        status: proof.status,
        sha256: proof.sha256,
        detail: `SHA-256 mismatch (${proof.sha256})`,
      };
    }

    return {
      pass: true,
      status: proof.status,
      sha256: proof.sha256,
      detail: `HTTP ${proof.status} sha256=${proof.sha256}`,
    };
  }

  const proof = await fetchProof(url, fetchImpl);
  if (!proof.ok) {
    return {
      pass: false,
      reason: "http_not_ok",
      status: proof.status,
      detail: `HTTP ${proof.status || "error"}`,
      error: proof.error,
    };
  }

  return { pass: true, status: proof.status, detail: `HTTP ${proof.status}` };
}

export async function buildReadinessGates({
  root,
  fetchImpl = fetch,
  lookupImpl = defaultLookup,
}) {
  const configSrc = readText(root, "site/app/config.ts");
  const checkoutUrl = extractConfigUrl(configSrc, "CHECKOUT_URL");
  const downloadUrl = extractConfigUrl(configSrc, "DOWNLOAD_URL");
  const downloadSha256 = extractConfigUrl(configSrc, "DOWNLOAD_SHA256");

  const checkout = await evaluateExternalLink({
    kind: "checkout",
    url: checkoutUrl,
    fetchImpl,
  });
  const download = await evaluateExternalLink({
    kind: "download",
    url: downloadUrl,
    expectedSha256: downloadSha256,
    fetchImpl,
  });
  const domain = await evaluateProductionDomain({ fetchImpl, lookupImpl });

  return [
    {
      name: "Core domain logic built",
      pass: existsSync(join(root, "packages/core/dist/index.js")),
      detail: "packages/core/dist/index.js",
      blocker: "run npm run build:core",
    },
    {
      name: "Desktop app bundled",
      pass:
        existsSync(join(root, "desktop/dist/main.js")) &&
        existsSync(join(root, "desktop/dist/renderer.js")),
      detail: "desktop/dist/{main,renderer}.js",
      blocker: "run npm run build:desktop",
    },
    {
      name: "Site static export present",
      pass: existsSync(join(root, "site/out/index.html")),
      detail: "site/out/index.html",
      blocker: "run npm run build:site",
    },
    {
      name: "Stripe $19 checkout link wired",
      pass: checkout.pass,
      detail: checkout.pass
        ? `${checkoutUrl} (${checkout.detail})`
        : `site/app/config.ts -> CHECKOUT_URL (${checkout.detail})`,
      blocker:
        "create a real Stripe Payment Link ($19 one-time), set CHECKOUT_URL, and verify it returns HTTP 2xx",
    },
    {
      name: "Windows installer download wired",
      pass: download.pass,
      detail: download.pass
        ? `${downloadUrl} (${download.detail})`
        : `site/app/config.ts -> DOWNLOAD_URL/DOWNLOAD_SHA256 (${download.detail})`,
      blocker:
        "produce a signed Windows installer, publish its SHA-256, host it, set DOWNLOAD_URL and DOWNLOAD_SHA256, and verify the bytes match",
    },
    {
      name: "Production domain owned + attached",
      pass: domain.pass,
      detail: domain.pass
        ? `${PRODUCTION_HOST} (${domain.detail})`
        : `${PRODUCTION_HOST} (${domain.detail})`,
      blocker:
        "point daybreak.rest apex A records at GitHub Pages, attach as custom domain, and wait for HTTPS to serve the app",
    },
    {
      name: "Real market signal (>=1 paid order)",
      pass: false,
      detail: "paid_orders=0 refunds=0 - no fabricated proof permitted",
      blocker: "ship checkout, then earn the first real $19 order",
    },
  ];
}

export function renderReadinessReport(gates) {
  const passed = gates.filter((g) => g.pass).length;
  const total = gates.length;
  const allPass = passed === total;
  const lines = [];

  lines.push(`# Daybreak readiness - ${passed}/${total} gates pass`, "");
  lines.push("| Gate | State | Detail |");
  lines.push("| --- | --- | --- |");
  for (const g of gates) {
    lines.push(`| ${g.name} | ${g.pass ? "pass" : "PENDING"} | ${g.detail} |`);
  }

  const pending = gates.filter((g) => !g.pass);
  if (pending.length) {
    lines.push("", "## Remaining real blockers (honest)", "");
    for (const g of pending) {
      lines.push(`- **${g.name}** -> ${g.blocker}`);
    }
  }

  lines.push(
    "",
    `DAYBREAK_READINESS=${allPass ? "ready" : "pending"} passed=${passed} total=${total}`,
  );

  return { allPass, text: lines.join("\n") };
}
