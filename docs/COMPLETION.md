# Daybreak — completion ledger

Same standard we held TraceReady to: a thing is "done" only when it's real and
verified by command output, and remaining gaps are stated honestly with **no
fabricated proof**.

## Verified real (command-backed)

| Item | Evidence |
| --- | --- |
| Core mechanic works & is tested | `vitest run` → **16 tests, 3 files passed** (wipe machine, carry-over, streak) |
| App actually launches | `DAYBREAK_SMOKE=1 electron .` → `DAYBREAK_SMOKE=pass renderer_loaded=true ipc_roundtrip=true`, exit 0 |
| Un-closable invariant enforced | `desktop/src/main/main.ts` `close` handler + `canDismiss()` re-validated in main |
| Whole repo builds clean | `npm run check` → lint + test + build (core, desktop, site) **exit 0** |
| Site exports as static HTML | `next build` → 4 static pages exported to `site/out/` |
| Domain is available | RDAP 404 + no nameservers for `daybreakdesk.com` (Namecheap-registerable) |

## Honestly pending (real blockers — readiness gate = 3/7)

These require the owner; none are faked to look done.

1. **Buy `daybreakdesk.com`** on Namecheap, point apex `A` records at GitHub
   Pages (185.199.108–111.153), attach as the repo's custom domain, then move
   `deploy/CNAME` into the production build (drop `DAYBREAK_BASE_PATH`).
2. **Create the real Stripe Payment Link** ($19 one-time) and set
   `CHECKOUT_URL` in `site/app/config.ts`. Until then the page shows an honest
   "checkout opening soon" state — not a fake button.
3. **Produce a signed Windows installer.** `npm run package` is wired
   (electron-builder/NSIS), but a real release needs a code-signing cert so
   SmartScreen doesn't flag it; then host it and set `DOWNLOAD_URL`.
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
npm run check                 # all gates green
npm run verify:readiness      # 3/7 pass, honest blockers listed (exit 1)
DAYBREAK_SMOKE=1 npx electron . --prefix desktop   # app launch proof
```
