#!/usr/bin/env node
// Daybreak readiness gate — modeled on TraceReady's sale-readiness discipline.
// It reports the REAL state of each launch-blocking component and refuses to
// call Daybreak sale-ready while any hard proof is still missing. It never
// fabricates a "pass": every pass is backed by a file on disk or a checked URL.
//
// Exit 0 only when every gate passes, OR when --allow-pending is given (then it
// prints the honest pending report and exits 0 so it can run inside `check`
// without blocking the build).

import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const allowPending = process.argv.includes("--allow-pending");

function read(p) {
  try {
    return readFileSync(join(root, p), "utf8");
  } catch {
    return "";
  }
}

const configSrc = read("site/app/config.ts");
const checkoutConfigured =
  /CHECKOUT_URL\s*=\s*"https:\/\//.test(configSrc);
const downloadConfigured =
  /DOWNLOAD_URL\s*=\s*"https:\/\//.test(configSrc);

const gates = [
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
    pass: checkoutConfigured,
    detail: "site/app/config.ts → CHECKOUT_URL",
    blocker:
      "create a real Stripe Payment Link ($19 one-time) and set CHECKOUT_URL",
  },
  {
    name: "Windows installer download wired",
    pass: downloadConfigured,
    detail: "site/app/config.ts → DOWNLOAD_URL",
    blocker:
      "produce a signed Windows installer, host it, and set DOWNLOAD_URL",
  },
  {
    name: "Production domain owned + attached",
    pass: false,
    detail: "daybreakdesk.com (verified available on Namecheap, NOT purchased)",
    blocker:
      "buy daybreakdesk.com on Namecheap, point apex A records at GitHub Pages, attach as custom domain",
  },
  {
    name: "Real market signal (≥1 paid order)",
    pass: false,
    detail: "paid_orders=0 refunds=0 — no fabricated proof permitted",
    blocker: "ship checkout, then earn the first real $19 order",
  },
];

const passed = gates.filter((g) => g.pass).length;
const total = gates.length;
const allPass = passed === total;

console.log(`# Daybreak readiness — ${passed}/${total} gates pass\n`);
console.log("| Gate | State | Detail |");
console.log("| --- | --- | --- |");
for (const g of gates) {
  console.log(`| ${g.name} | ${g.pass ? "pass" : "PENDING"} | ${g.detail} |`);
}

const pending = gates.filter((g) => !g.pass);
if (pending.length) {
  console.log("\n## Remaining real blockers (honest)\n");
  for (const g of pending) {
    console.log(`- **${g.name}** → ${g.blocker}`);
  }
}

console.log(
  `\nDAYBREAK_READINESS=${allPass ? "ready" : "pending"} passed=${passed} total=${total}`,
);

if (allPass) process.exit(0);
process.exit(allowPending ? 0 : 1);
