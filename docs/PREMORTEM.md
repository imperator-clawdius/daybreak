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
| Fake HTTPS checkout/download URLs turn gates green | A placeholder external URL could make readiness look complete without real proof. | `verify:readiness` now requires a `buy.stripe.com` Payment Link for checkout and HTTP 2xx proof for checkout/download URLs. |
| Public site promises legal/privacy posture without pages | A paid product needs visible policy pages before checkout opens. | Added `/privacy/` and `/terms/`, linked from the footer. |
| Landing page copy drifts from implementation | The site said "local database" while v1 persists local JSON. | FAQ now says "local file," matching the completion ledger. |
| Pending CTA points nowhere | A disabled-looking checkout link to a missing anchor feels unfinished. | Pending checkout is rendered as non-clickable status, and the page now exposes a launch status section. |
| Critical production dependency advisories | A sale page should not ship on a known critical Next.js audit set. | Upgraded Next and `eslint-config-next` from `15.1.6` to `15.5.19`; migrated linting from deprecated `next lint` to direct ESLint CLI. |
| Random 200 OK file satisfies installer readiness | A mistyped, stale, or spoofed download URL could look sale-ready even if it is not the signed Daybreak installer. | `verify:readiness` now requires `DOWNLOAD_SHA256` and hashes the fetched installer bytes before the installer gate can pass. |
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
| Nested PostCSS audit warning in Next | `npm audit --omit=dev` still reports a moderate `postcss <8.5.10` advisory under `node_modules/next/node_modules/postcss`; npm's suggested force fix would downgrade Next to 9.3.3. | Accepted as a bounded static-export build-time risk for now. Daybreak does not stringify untrusted CSS, does not run a public Next server, and deploys static HTML to GitHub Pages. Recheck when Next publishes a patched dependency path. |

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
