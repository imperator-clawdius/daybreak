# Daybreak completion ledger

Same standard we held TraceReady to: a thing is "done" only when it is real and
verified by command output, and remaining gaps are stated honestly with **no
fabricated proof**.

## Verified real (command-backed)

| Item | Evidence |
| --- | --- |
| Core mechanic works and is tested | `vitest run` -> **92 tests, 14 files passed** (wipe machine, carry-over, morning commit gate, same-day migration, session selection, swipe gesture policy, IPC log-update validation, desktop shell policy, startup policy, persisted-shape validation, persistence recovery, consecutive history-backed streak summary, commit validation, external-link policy, readiness URL proof, launch verifier, release preflight) |
| App actually launches and completes the wipe flows | `DAYBREAK_SMOKE=1 electron .` -> `scenario=morning swipe_flow=true`, exit 0; `DAYBREAK_SMOKE=1 DAYBREAK_SMOKE_SCENARIO=evening electron .` -> `scenario=evening swipe_flow=true streak_summary=true`, exit 0 |
| Landing page shows the real desktop app | From `desktop/`, `DAYBREAK_SMOKE=1 DAYBREAK_SMOKE_COMMIT_TEXT="Ship Daybreak" DAYBREAK_SMOKE_SCREENSHOT=../site/public/daybreak-app.png npx electron .` -> `scenario=morning swipe_flow=true screenshot=true`, exit 0; the PNG is generated from the Electron app, not drawn as a mockup |
| Un-closable invariant enforced | `desktop/src/main/main.ts` `close` handler plus `validateLogUpdate()` and `canDismiss()` re-validated against the active main-process session |
| Desktop shell is contained | BrowserWindow uses context isolation, no node integration, `sandbox: true`, denied new windows, and a core-tested file-navigation allowlist |
| Packaged Windows app registers for first-login startup | `desktop/src/main/main.ts` calls `app.setLoginItemSettings({ openAtLogin: true })` only for packaged Windows production builds; smoke and dev runs are excluded by core-tested policy |
| Weekly streak display is history-backed and consecutive | Main returns stored day history to the renderer, core merges it with the current in-memory day, missed weeks break the weekly streak, and evening smoke proves a two-week historical streak renders after review |
| Local persistence is crash-tolerant | Desktop `Store` writes via `.tmp`, preserves `.bak`, rejects malformed day logs, and recovers from corrupt or malformed primary JSON in automated tests |
| Desktop packaging uses current core output | `@daybreak/desktop` builds `@daybreak/core` before esbuild bundling so direct packaging does not depend on stale core `dist` output |
| Whole repo builds clean | `npm run check` -> lint plus test plus build (core, desktop, site), exit 0 |
| Site exports as static HTML | `next build` -> `/`, `/privacy`, `/terms`, and 404 static pages exported to `site/out/` |
| Unsigned installer packages | `npm run package -w @daybreak/desktop` -> `desktop/release/Daybreak Setup 0.1.0.exe`; signing skipped because no cert is configured |
| Release preflight is honest | `npm run verify:release` -> installer exists, SHA-256 is reported, `icon_status=configured`, `signature_status=NotSigned`, exit 1 until a real cert signs it |
| Windows release metadata configured | `npm run verify:release` checks app id, product name, author, NSIS x64 target, and installer mode before a release can be considered ready |
| Windows app icon configured | `desktop/package.json` sets `build.win.icon` to `desktop/assets/icon.ico`; `npm run package -w @daybreak/desktop` no longer emits the default Electron icon warning |
| Domain is attached over HTTP | Owner confirmed `daybreak.rest` was purchased on Namecheap; apex `A` records resolve to GitHub Pages and the repo Pages custom domain is set to `daybreak.rest`; HTTPS certificate issuance is still pending |
| HTTPS domain blocker is visible | `npm run verify:launch` and `npm run verify:readiness` surface the apex HTTPS/certificate fetch error instead of hiding it behind a generic HTTP status |
| Preview remains visible while production waits | `npm run verify:launch` reports `PREVIEW_SITE` for the GitHub Pages project URL alongside the production apex status |
| HTTP apex status is separated from HTTPS readiness | `npm run verify:launch` reports `APEX_HTTP_SITE` so an HTTP 200 cannot be mistaken for production HTTPS readiness |
| Actionable dependency advisories reduced | Electron/electron-builder/esbuild/Vitest upgraded; `npm audit --omit=dev` and full `npm audit --audit-level=moderate` now report only the bounded Next/PostCSS moderate advisory whose npm force-fix would downgrade Next to 9.3.3 |

## Honestly pending (real blockers - readiness gate = 3/7)

These require the owner; none are faked to look done.

1. **Finish `daybreak.rest` HTTPS production.** Keep apex `A` records pointed at
   GitHub Pages (185.199.108-111.153), let the Pages workflow publish
   `deploy/CNAME`, wait for GitHub's Pages certificate, then enforce HTTPS and
   verify `https://daybreak.rest/`.
2. **Create the real Stripe Payment Link** ($19 one-time) and set
   `CHECKOUT_URL` in `site/app/config.ts`. The readiness gate requires a
   `buy.stripe.com` URL that returns HTTP 2xx. Until then the page shows an
   honest "checkout opening soon" state - not a fake button.
3. **Produce a signed Windows installer.** Unsigned NSIS packaging works, but a
   real release needs a code-signing cert so SmartScreen does not flag it; then
   host it, set `DOWNLOAD_URL` and `DOWNLOAD_SHA256`, and let the readiness gate
   verify both HTTP 2xx and the downloaded file hash.
4. **Earn the first real $19 order.** Market signal is `0` and stays `0` in the
   readiness gate until a genuine paid order exists.

## Known deviation from the locked spec

- Spec said "local SQLite." v1 ships **local JSON** (`daybreak.json` in the OS
  user-data dir) behind a storage-agnostic `Store` interface. Same user promise
  (local, private, no cloud); SQLite is a drop-in adapter behind that interface.
  Flagged here rather than silently claimed as SQLite.

## Reproduce

```bash
npm install
npm run check
npm run verify:readiness
npm run verify:launch
npm run package -w @daybreak/desktop
npm run verify:release
DAYBREAK_SMOKE=1 npx electron . --prefix desktop
(cd desktop && DAYBREAK_SMOKE=1 DAYBREAK_SMOKE_COMMIT_TEXT="Ship Daybreak" DAYBREAK_SMOKE_SCREENSHOT=../site/public/daybreak-app.png npx electron .)
DAYBREAK_SMOKE=1 DAYBREAK_SMOKE_SCENARIO=evening npx electron . --prefix desktop
```

`npm run verify:readiness` must keep exiting 1 until the real domain, Stripe
Payment Link, signed hosted installer, and first paid order exist.
`npm run verify:release` must keep exiting 1 until the installer is actually
signed.
