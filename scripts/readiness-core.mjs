import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

export async function evaluateExternalLink({ kind, url, fetchImpl = fetch }) {
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

export async function buildReadinessGates({ root, fetchImpl = fetch }) {
  const configSrc = readText(root, "site/app/config.ts");
  const checkoutUrl = extractConfigUrl(configSrc, "CHECKOUT_URL");
  const downloadUrl = extractConfigUrl(configSrc, "DOWNLOAD_URL");

  const checkout = await evaluateExternalLink({
    kind: "checkout",
    url: checkoutUrl,
    fetchImpl,
  });
  const download = await evaluateExternalLink({
    kind: "download",
    url: downloadUrl,
    fetchImpl,
  });

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
        : `site/app/config.ts -> DOWNLOAD_URL (${download.detail})`,
      blocker:
        "produce a signed Windows installer, host it, set DOWNLOAD_URL, and verify it returns HTTP 2xx",
    },
    {
      name: "Production domain owned + attached",
      pass: false,
      detail: "daybreakdesk.com (verified available on Namecheap, NOT purchased)",
      blocker:
        "buy daybreakdesk.com on Namecheap, point apex A records at GitHub Pages, attach as custom domain",
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
