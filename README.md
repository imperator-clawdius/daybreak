# Daybreak

**Wipe the morning before it owns you.** A Windows app that takes over your
screen at first login, surfaces yesterday's unfinished business, asks for
today's three commitments — and won't get out of your way until you've
physically wiped every item: **commit, defer, or kill.**

- Windows desktop · **$19 one-time**, lifetime updates, no subscription
- Local-only: no account, no cloud, no telemetry
- Ship-or-die cycle 2 · built in public

## Monorepo

| Workspace | What it is |
| --- | --- |
| `packages/core` | Pure domain logic (wipe machine, carry-over, streak) — 16 unit tests |
| `desktop` | Electron app, esbuild bundle, consumes `@daybreak/core` |
| `site` | Next.js static landing page → GitHub Pages |
| `scripts` | Launch + readiness verifiers |

## Develop

```bash
npm install
npm run check            # lint + test + build (all workspaces)
npm run dev:desktop      # run the Electron app locally
npm run dev:site         # run the landing page locally
npm run verify:readiness # honest launch-blocker report
```

## Status

See [`docs/COMPLETION.md`](docs/COMPLETION.md) for the honest completion ledger:
what is real and verified vs. what is still blocked (domain purchase, Stripe
link, signed installer, first real sale). No fabricated proof appears anywhere
in this project — by policy (`AGENTS.md`).

Domain: **daybreakdesk.com** (verified available on Namecheap; purchase pending).
