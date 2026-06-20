# Working in this repo (read before editing)

Daybreak is ship-or-die cycle 2: a Windows morning intent-setter you cannot
dismiss until every commitment is wiped. Monorepo, npm workspaces.

## Layout
- `packages/core` — pure, dependency-free domain logic (wipe state machine,
  carry-over, streak). **All behavior changes start here, with a test.**
- `desktop` — Electron app (esbuild bundle). Consumes `@daybreak/core`. The
  un-closable-until-wiped invariant lives in `src/main/main.ts`.
- `site` — Next.js static-export landing page → GitHub Pages.
- `scripts` — `verify-launch.mjs` (live site) and `verify-readiness.mjs`
  (honest launch-blocker gate).
- `deploy/CNAME` — production apex domain, applied only when the domain exists.

## Non-negotiables (same rules that governed TraceReady)
1. **No fabricated proof.** No fake testimonials, reviews, order counts, replies,
   or screenshots. `verify-readiness.mjs` must report `pending` until a real
   paid order exists. A green gate must be backed by a file or a checked URL.
2. **The landing page tells the truth.** "Opening soon" means genuinely not
   live. Never wire a button to a fake/placeholder Stripe URL and call it ready.
3. **Local-only product promise.** No auth, no cloud sync, no telemetry. User
   data stays in a local file.
4. **Scope is locked (v1):** morning prompt, swipe-to-wipe, evening review,
   weekly streak. Everything else (mobile, web, sync, AI) is deferred.

## Gates
- `npm run check` = lint (typecheck + next lint) + test + build (core, desktop, site).
- `npm run verify:readiness` — exits 1 while any launch blocker is open.
- `npm run verify:launch` — exits 0 only when the live site returns 200.

Run `npm run check` green before every commit.
