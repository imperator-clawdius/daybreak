# Daybreak

**Wipe the morning before it owns you.** A Windows app that takes over your
screen at first login, surfaces yesterday's unfinished business, asks for
today's three commitments, and will not get out of your way until you have
physically wiped every item: **commit, defer, or kill.**

- Windows desktop - **$19 one-time**, lifetime updates, no subscription
- Local-only: no account, no cloud, no telemetry
- Ship-or-die cycle 2 - built in public

## Monorepo

| Workspace | What it is |
| --- | --- |
| `packages/core` | Pure domain logic (wipe machine, carry-over, streak, commit validation) |
| `desktop` | Electron app, esbuild bundle, consumes `@daybreak/core` |
| `site` | Next.js static landing page to GitHub Pages |
| `scripts` | Launch and readiness verifiers |

## Develop

```bash
npm install
npm start                # build and run the Electron app locally
npm run check            # lint + test + build (all workspaces)
npm run dev:desktop      # run the Electron app locally
npm run dev:site         # run the landing page locally
npm run verify:readiness # honest launch-blocker report
npm run verify:local-only # desktop no-telemetry guard
npm run verify:pages-health # GitHub Pages DNS/cert health
npm run verify:release   # installer checksum + signing/timestamp preflight
```

## Status

See [`docs/COMPLETION.md`](docs/COMPLETION.md) for the honest completion ledger
and [`docs/PREMORTEM.md`](docs/PREMORTEM.md) for the launch-hardening premortem:
what is real and verified vs. what is still blocked (GitHub Pages HTTPS
certificate, Stripe link, signed and timestamped hosted installer, first real sale). No
fabricated proof appears anywhere in this project by policy (`AGENTS.md`).

Domain: **daybreak.rest** (purchased on Namecheap; apex DNS and Pages custom domain set; GitHub Pages HTTPS certificate pending).
