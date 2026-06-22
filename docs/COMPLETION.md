# Daybreak completion ledger

Same standard we held TraceReady to: a thing is "done" only when it is real and
verified by command output, and remaining gaps are stated honestly with **no
fabricated proof**.

## Verified real (command-backed)

| Item | Evidence |
| --- | --- |
| Core mechanic works and is tested | `vitest run` -> **171 tests, 26 files passed** (wipe machine, carry-over, morning commit gate, same-day migration, session selection, swipe gesture policy, IPC log-update validation, desktop shell policy, desktop renderer CSP policy, startup policy, persisted-shape validation, persistence recovery, consecutive history-backed streak summary, commit validation, external-link policy, market-signal policy, readiness URL proof, launch verifier, release preflight, packaged release smoke suite, core package importability, static site metadata export, proof-backed public checkout/download state, legal checkout copy state, sensitive proof-data rejection, Pages workflow proof/dependency redeploy triggers, dependency security posture, CI workflow coverage, root desktop launch contract, GitHub Pages health verifier, local-only telemetry guard) |
| App actually launches and completes the wipe flows | From repo root in PowerShell, `$env:DAYBREAK_SMOKE = "1"; npx electron .` -> `scenario=morning swipe_flow=true`, exit 0; `$env:DAYBREAK_SMOKE = "1"; npm start` -> `scenario=morning swipe_flow=true`, exit 0; `$env:DAYBREAK_SMOKE = "1"; npm exec -w @daybreak/desktop -- electron .` -> `scenario=morning swipe_flow=true`, exit 0; `$env:DAYBREAK_SMOKE = "1"; $env:DAYBREAK_SMOKE_SCENARIO = "evening"; npm exec -w @daybreak/desktop -- electron .` -> `scenario=evening swipe_flow=true streak_summary=true`, exit 0 |
| Landing page shows the real desktop app | From `desktop/`, `DAYBREAK_SMOKE=1 DAYBREAK_SMOKE_COMMIT_TEXT="Ship Daybreak" DAYBREAK_SMOKE_SCREENSHOT=../site/public/daybreak-app.png npx electron .` -> `scenario=morning swipe_flow=true screenshot=true`, exit 0; the PNG is generated from the Electron app, not drawn as a mockup |
| Un-closable invariant enforced | `desktop/src/main/main.ts` `close` handler plus `validateLogUpdate()` and `canDismiss()` re-validated against the active main-process session |
| Desktop shell is contained | BrowserWindow uses context isolation, no node integration, `sandbox: true`, denied new windows, and a core-tested file-navigation allowlist |
| Desktop renderer CSP is strict and repeatable | Core owns the renderer Content Security Policy, `desktop/src/renderer/index.html` uses that exact policy, and `scripts/desktop-renderer-security.test.ts` rejects drift toward inline script/style, remote fetch, forms, object content, or broad default sources |
| Desktop no-telemetry promise is guarded | `npm run verify:local-only` scans desktop runtime source/static assets for outbound network/telemetry APIs or remote URLs and desktop runtime dependencies for telemetry packages; current output is `LOCAL_ONLY=pass` with only `@daybreak/core` as a runtime dependency |
| Packaged Windows app registers for first-login startup | `desktop/src/main/main.ts` calls `app.setLoginItemSettings({ openAtLogin: true })` only for packaged Windows production builds; smoke and dev runs are excluded by core-tested policy |
| Weekly streak display is history-backed and consecutive | Main returns stored day history to the renderer, core merges it with the current in-memory day, missed weeks break the weekly streak, and evening smoke proves a two-week historical streak renders after review |
| Local persistence is crash-tolerant | Desktop `Store` writes via `.tmp`, preserves `.bak`, rejects malformed day logs, and recovers from corrupt or malformed primary JSON in automated tests |
| Desktop packaging uses current core output | `@daybreak/desktop` builds `@daybreak/core` before esbuild bundling so direct packaging does not depend on stale core `dist` output |
| Built core package is Node-ESM importable | `scripts/core-package.test.ts` builds `@daybreak/core` and imports `packages/core/dist/index.js` in plain Node, proving emitted relative specifiers resolve without Vitest aliases or bundler help |
| Whole repo builds clean | `npm run check` -> lint plus test plus build (core, desktop, site), exit 0 |
| CI runs repo gates | `.github/workflows/check.yml` runs on pushes and pull requests with Node 24, `npm ci`, `npm audit --omit=dev --audit-level=moderate`, `npm run check`, and `npm run verify:local-only`; `scripts/ci-workflow.test.ts` proves the workflow contains those gates |
| Site exports as static HTML | `next build` -> `/`, `/privacy`, `/terms`, and 404 static pages exported to `site/out/` |
| Unsigned installer packages | `npm run package -w @daybreak/desktop` -> `desktop/release/Daybreak Setup 0.1.0.exe`; signing skipped because no cert is configured |
| Release preflight is honest | `npm run verify:release` -> installer exists, SHA-256 is reported, `icon_status=configured`, `signature_status=NotSigned`, exit 1 until a real cert signs it |
| Packaged Windows app runtime is smoke-tested | `npm run verify:release` launches `desktop/release/win-unpacked/Daybreak.exe` with `DAYBREAK_SMOKE=1` for morning and evening scenarios and requires the packaged app to load the renderer, complete IPC, finish the wipe flow, and render the evening streak summary before reporting `packaged_smoke=pass` |
| Windows release metadata configured | `npm run verify:release` checks app id, product name, author, NSIS x64 target, and installer mode before a release can be considered ready |
| Windows signer ownership is verified | `npm run verify:release` rejects even a valid Authenticode signature unless the signer subject includes `Passive Print Labs LLC` |
| Hosted installer readiness verifies signing | `npm run verify:readiness` downloads the configured installer bytes, checks SHA-256, rejects unsigned or wrong-publisher Authenticode signatures, and requires `proof/installer-download.json` to match the hosted signed installer |
| Checkout readiness requires Stripe price proof | `npm run verify:readiness` requires `proof/stripe-payment-link.json` to prove the configured Stripe Payment Link is active, live-mode, one-time, and USD 1900 cents |
| Checkout readiness rejects extra Stripe line items | Core proof state and `npm run verify:readiness` require exactly one Stripe line item, so an added fee, upsell, or second product cannot hide behind one matching $19 item |
| Checkout readiness fails closed on malformed Stripe proof | Core proof state and `npm run verify:readiness` reject non-array `line_items.data`, non-object line item entries, malformed quantity fields, and missing price objects instead of throwing or misclassifying malformed proof |
| Public checkout CTA requires Stripe proof | The landing page uses core's proof-backed checkout state and reads `proof/stripe-payment-link.json` during static export, so a syntactically valid Stripe URL still renders as "Checkout opening soon" until the proof matches |
| Legal checkout copy follows Stripe proof state | Terms and privacy pages read the proof-backed public checkout state, and `scripts/legal-checkout-copy.test.ts` prevents stale hard-coded checkout-closed copy from shipping after Stripe proof is connected |
| Public download CTA requires signed-installer proof | The landing page reads `proof/installer-download.json` during static export, so a syntactically valid HTTPS download URL plus SHA-256 still renders as "Installer in final packaging" until the proof matches a valid Passive Print Labs signature |
| Checkout, installer, and paid-order proof reject sensitive data | Core proof state and `npm run verify:readiness` recursively reject proof artifacts containing keys, key-name variants, auth/session headers, customer data, payment identifiers, request/response logs, or certificate private material |
| Proof and dependency changes redeploy the site | `.github/workflows/pages.yml` watches `proof/stripe-payment-link.json`, `proof/installer-download.json`, `package.json`, and `package-lock.json`, with `scripts/pages-workflow.test.ts` proving corrected proof or root dependency changes will trigger a Pages rebuild |
| First-order readiness requires redacted Stripe paid-order proof | `npm run verify:readiness` keeps market signal pending until `proof/first-paid-order.json` proves a live, complete, paid, unrefunded USD 1900 Checkout Session for the configured Payment Link, and rejects proof that includes customer data, payment-detail fields, auth/session headers, request/response logs, or private-key material |
| First-order readiness requires explicit refund proof | Core and `npm run verify:readiness` reject paid-order proof unless `refunds.data` exists as an array, so omitting refund data cannot be treated as proof of zero refunds |
| Windows app icon configured | `desktop/package.json` sets `build.win.icon` to `desktop/assets/icon.ico`; `npm run package -w @daybreak/desktop` no longer emits the default Electron icon warning |
| Domain is attached over HTTP | Owner confirmed `daybreak.rest` was purchased on Namecheap; apex `A` records resolve to GitHub Pages and the repo Pages custom domain is set to `daybreak.rest`; HTTPS certificate issuance is still pending |
| GitHub Pages health is repeatable | `npm run verify:pages-health` polls GitHub's Pages health endpoint and reports both `daybreak.rest` and `www.daybreak.rest` as DNS-valid, served by Pages, and HTTPS-eligible, while keeping `PAGES_HEALTH=pending` until the certificate exists and HTTPS is enforced |
| HTTPS domain blocker is visible | `npm run verify:launch` and `npm run verify:readiness` surface the apex and `www` HTTPS/certificate fetch errors, including underlying TLS cause details when Node exposes them, instead of hiding them behind a generic HTTP status |
| WWW domain status is visible | `npm run verify:launch` reports `WWW_DNS`, `WWW_HTTP_SITE`, `WWW_HTTP_ROUTES`, `WWW_SITE`, and `WWW_ROUTES`, so `www.daybreak.rest` cannot silently be broken while the apex is being checked |
| Preview redirect is not overclaimed | `npm run verify:launch` fetches the GitHub Pages project URL with manual redirect handling, so a custom-domain redirect reports `PREVIEW_SITE=pending status=301` instead of borrowing the apex response |
| HTTP apex status is separated from HTTPS readiness | `npm run verify:launch` reports `APEX_HTTP_SITE` so an HTTP 200 cannot be mistaken for production HTTPS readiness |
| Public launch status copy matches HTTP/HTTPS reality | The homepage status section says `daybreak.rest` serves over HTTP while GitHub Pages provisions HTTPS; `scripts/site-export-metadata.test.ts` rejects the older "GitHub Pages preview is online" overclaim |
| Required legal routes are checked live | `npm run verify:launch` checks `/privacy/` and `/terms/` on the preview, HTTP apex, and HTTPS apex instead of trusting the homepage alone |
| Production crawler/social metadata is exported | `scripts/site-export-metadata.test.ts` builds the site and checks `robots.txt`, `sitemap.xml`, homepage canonical URL, legal page self-canonical URLs, legal page Open Graph and Twitter title/URL identity, and Open Graph/Twitter image metadata for `https://daybreak.rest`; `npm run verify:launch` checks crawler routes alongside legal routes live |
| Actionable dependency advisories closed | Electron/electron-builder/esbuild/Vitest upgraded; Next's pinned PostCSS copy is overridden/deduped to `postcss@8.5.15`; `scripts/dependency-security.test.ts` rejects locked PostCSS packages below `8.5.10`; `npm audit --omit=dev --audit-level=moderate` -> `found 0 vulnerabilities` |

## Honestly pending (real blockers - readiness gate = 3/7)

These require the owner; none are faked to look done.

1. **Finish `daybreak.rest` HTTPS production.** Keep apex `A` records pointed at
   GitHub Pages (185.199.108-111.153), keep `www` as a GitHub Pages CNAME, let
   the Pages workflow publish `deploy/CNAME`, wait for GitHub's Pages
   certificate, then enforce HTTPS and verify both `https://daybreak.rest/` and
   `https://www.daybreak.rest/`.
2. **Create the real Stripe Payment Link** ($19 one-time) and set
   `CHECKOUT_URL` in `site/app/config.ts`. Add `proof/stripe-payment-link.json`
   from Stripe so the readiness gate can prove the link is active, live-mode,
   one-time, and USD 1900 cents. Until then the page shows an honest
   "checkout opening soon" state - not a fake button.
3. **Produce a signed Windows installer.** Unsigned NSIS packaging works, but a
   real release needs a code-signing cert so SmartScreen does not flag it; then
   host it, set `DOWNLOAD_URL` and `DOWNLOAD_SHA256`, add
   `proof/installer-download.json`, and let the readiness gate verify HTTP 2xx,
   the downloaded file hash, the proof file, and the Passive Print Labs
   Authenticode signer.
4. **Earn the first real $19 order.** Market signal is `0` and stays `0` in the
   readiness gate until redacted `proof/first-paid-order.json` proves a genuine
   live, paid, unrefunded Stripe Checkout Session for USD 1900.

## Known deviation from the locked spec

- Spec said "local SQLite." v1 ships **local JSON** (`daybreak.json` in the OS
  user-data dir) behind a storage-agnostic `Store` interface. Same user promise
  (local, private, no cloud); SQLite is a drop-in adapter behind that interface.
  Flagged here rather than silently claimed as SQLite.

## Reproduce

```powershell
npm install
npm audit --omit=dev --audit-level=moderate
npm run check
npm run verify:readiness
npm run verify:launch
npm run verify:local-only
npm run verify:pages-health
npm run package -w @daybreak/desktop
npm run verify:release
$env:DAYBREAK_SMOKE = "1"; npx electron .; Remove-Item Env:DAYBREAK_SMOKE
$env:DAYBREAK_SMOKE = "1"; npm start; Remove-Item Env:DAYBREAK_SMOKE
$env:DAYBREAK_SMOKE = "1"; npm exec -w @daybreak/desktop -- electron .; Remove-Item Env:DAYBREAK_SMOKE
$env:DAYBREAK_SMOKE = "1"; $env:DAYBREAK_SMOKE_COMMIT_TEXT = "Ship Daybreak"; $env:DAYBREAK_SMOKE_SCREENSHOT = "../site/public/daybreak-app.png"; npm exec -w @daybreak/desktop -- electron .; Remove-Item Env:DAYBREAK_SMOKE,Env:DAYBREAK_SMOKE_COMMIT_TEXT,Env:DAYBREAK_SMOKE_SCREENSHOT
$env:DAYBREAK_SMOKE = "1"; $env:DAYBREAK_SMOKE_SCENARIO = "evening"; npm exec -w @daybreak/desktop -- electron .; Remove-Item Env:DAYBREAK_SMOKE,Env:DAYBREAK_SMOKE_SCENARIO
```

`npm run verify:readiness` must keep exiting 1 until the real domain, Stripe
Payment Link, signed hosted installer, and first paid order exist.
`npm run verify:release` must keep exiting 1 until the installer is actually
signed.
