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

## Still blocked by real-world artifacts

These remain intentionally pending and must not be faked:

1. Buy and attach `daybreakdesk.com`.
2. Create a real $19 one-time Stripe Payment Link.
3. Sign and host the Windows installer.
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
```

`verify:readiness` should keep exiting 1 until all four real-world artifacts
exist and are verified.
