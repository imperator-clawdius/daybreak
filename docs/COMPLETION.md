# Daybreak completion ledger

Same standard we held TraceReady to: a thing is "done" only when it is real and
verified by command output, and remaining gaps are stated honestly with **no
fabricated proof**.

## Verified real (command-backed)

| Item | Evidence |
| --- | --- |
| Core mechanic works and is tested | `vitest run` -> **30 tests, 5 files passed** (wipe machine, carry-over, streak, commit validation, readiness URL proof) |
| App actually launches | `DAYBREAK_SMOKE=1 electron .` -> `DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true`, exit 0 |
| Un-closable invariant enforced | `desktop/src/main/main.ts` `close` handler plus `canDismiss()` re-validated in main |
| Whole repo builds clean | `npm run check` -> lint plus test plus build (core, desktop, site), exit 0 |
| Site exports as static HTML | `next build` -> `/`, `/privacy`, `/terms`, and 404 static pages exported to `site/out/` |
| Unsigned installer packages | `npm run package -w @daybreak/desktop` -> `desktop/release/Daybreak Setup 0.1.0.exe`; signing skipped because no cert is configured |
| Domain is available | RDAP 404 plus no nameservers for `daybreakdesk.com` (Namecheap-registerable) |

## Honestly pending (real blockers - readiness gate = 3/7)

These require the owner; none are faked to look done.

1. **Buy `daybreakdesk.com`** on Namecheap, point apex `A` records at GitHub
   Pages (185.199.108-111.153), attach as the repo's custom domain, then move
   `deploy/CNAME` into the production build (drop `DAYBREAK_BASE_PATH`).
2. **Create the real Stripe Payment Link** ($19 one-time) and set
   `CHECKOUT_URL` in `site/app/config.ts`. The readiness gate requires a
   `buy.stripe.com` URL that returns HTTP 2xx. Until then the page shows an
   honest "checkout opening soon" state - not a fake button.
3. **Produce a signed Windows installer.** Unsigned NSIS packaging works, but a
   real release needs a code-signing cert so SmartScreen does not flag it; then
   host it, set `DOWNLOAD_URL`, and let the readiness gate verify HTTP 2xx.
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
DAYBREAK_SMOKE=1 npx electron . --prefix desktop
```

`npm run verify:readiness` must keep exiting 1 until the real domain, Stripe
Payment Link, signed hosted installer, and first paid order exist.
