# Daybreak sale-readiness premortem

Goal: make Daybreak feel like a professional, sale-ready shipped product while
keeping the readiness gate honest. No fabricated proof, payment links, order
counts, screenshots, or testimonials.

## Failure modes closed in this hardening pass

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Carried items duplicate across days | A repeated unresolved item would make the lock screen feel broken and punitive. | `carryForward()` now keeps only the latest copy per item id and does not resurrect later-resolved items. |
| Evening review rewrites morning completion | Streak and completion state could drift if evening persistence recalculated the wrong flag. | `resolveLogForPhase()` updates only the active ritual flag, and the renderer uses it. |
| Junk commitments enter the board | Empty, duplicate, or over-limit commitments weaken the core "three real commitments" promise. | Core `validateNewCommit()` normalizes text, rejects duplicates, enforces length, and blocks a fourth live commitment. |
| Commit gesture cannot finish the morning ritual | If "commit" leaves an item indistinguishable from an untouched item, the user can only close Daybreak by deferring or killing everything. | Core now distinguishes morning `pending` items from kept `open` commitments; `commit` moves an item to `open`, morning dismissal waits only on `pending`, and same-day reloads reuse the saved board without incrementing carry count. |
| Renderer payload bypasses the close invariant | A renderer bug or malformed IPC payload could drop pending items and ask main to close with a board the user never wiped. | Core `validateLogUpdate()` rejects dropped existing items, mutated immutable item fields, invalid phase states, evening additions, and over-cap new commitments; main now accepts save/dismiss only against its active session. |
| Desktop renderer escapes the local shell | Unexpected navigation or a new-window attempt would weaken the local-only, no-browser-surface promise of the Windows app. | The BrowserWindow now runs with `sandbox: true`, denies `window.open`, and uses a core-tested navigation policy that allows only the packaged `index.html` entrypoint. |
| Fake HTTPS checkout/download URLs turn gates green | A placeholder external URL could make readiness look complete without real proof. | `verify:readiness` now requires a `buy.stripe.com` Payment Link for checkout and HTTP 2xx proof for checkout/download URLs. |
| Public site promises legal/privacy posture without pages | A paid product needs visible policy pages before checkout opens. | Added `/privacy/` and `/terms/`, linked from the footer. |
| Landing page copy drifts from implementation | The site said "local database" while v1 persists local JSON. | FAQ now says "local file," matching the completion ledger. |
| Pending CTA points nowhere | A disabled-looking checkout link to a missing anchor feels unfinished. | Pending checkout is rendered as non-clickable status, and the page now exposes a launch status section. |
| Critical production dependency advisories | A sale page should not ship on a known critical Next.js audit set. | Upgraded Next and `eslint-config-next` from `15.1.6` to `15.5.19`; migrated linting from deprecated `next lint` to direct ESLint CLI. |
| Random 200 OK file satisfies installer readiness | A mistyped, stale, or spoofed download URL could look sale-ready even if it is not the signed Daybreak installer. | `verify:readiness` now requires `DOWNLOAD_SHA256` and hashes the fetched installer bytes before the installer gate can pass. |
| Landing page renders bad HTTPS links as live | The verifier could reject a non-Stripe checkout URL or an installer URL without a checksum while the public page still shows a live button. | External-link readiness policy now lives in `@daybreak/core` with tests, and the landing page uses it before rendering checkout or download links as active. |
| Desktop/toolchain advisories accumulate before launch | Old Electron, electron-builder, esbuild, and Vitest versions carried high/critical audit findings that would undermine a professional Windows release. | Upgraded Electron to 42.4.1, electron-builder to 26.15.3, esbuild to 0.28.1, and Vitest to 4.1.9; `npm run check`, Electron smoke, and NSIS packaging pass after the upgrade. |
| Installer ships with the default Electron icon | A paid Windows app with the stock Electron icon looks unfinished and weakens trust before first launch. | Added a Daybreak Windows icon asset, configured `build.win.icon`, and extended `verify:release` so the release preflight rejects missing icon configuration. |
| Pages deploy workflow ages into a runtime deprecation | A professional launch should not depend on action runtimes GitHub has already started warning about. | Pages CI now uses Node 24-compatible official actions and builds with Node 24. |
| Local release artifact lacks proof | Packaging could produce a file while leaving signing status and checksum to manual inspection. | Added `npm run verify:release`, which computes the installer SHA-256 and checks Authenticode status before any hosted release is considered ready. |

## Still blocked by real-world artifacts

These remain intentionally pending and must not be faked:

1. Finish `daybreak.rest` HTTPS certificate issuance and enforcement.
2. Create a real $19 one-time Stripe Payment Link.
3. Sign and host the Windows installer, then publish the exact SHA-256 checksum.
4. Earn at least one genuine paid order.

## Residual risks to monitor

| Risk | Current evidence | Position |
| --- | --- | --- |
| Nested PostCSS audit warning in Next | `npm audit --omit=dev` and full `npm audit --audit-level=moderate` still report only the moderate `postcss <8.5.10` advisory under `node_modules/next/node_modules/postcss`; npm's suggested force fix would downgrade Next to 9.3.3. | Accepted as a bounded static-export build-time risk for now. Daybreak does not stringify untrusted CSS, does not run a public Next server, and deploys static HTML to GitHub Pages. Recheck when Next publishes a patched dependency path. |

## Verification policy

Run these after each sale-readiness change:

```bash
npm run check
npm run verify:readiness
npm run verify:launch
DAYBREAK_SMOKE=1 npx electron . --prefix desktop
npm run package -w @daybreak/desktop
npm run verify:release
```

`verify:readiness` should keep exiting 1 until all four real-world artifacts
exist and are verified. `verify:release` should keep exiting 1 until the
installer is signed with a real code-signing certificate.
