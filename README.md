# 🐻 The Cold Front — Chicago Bears Fan Hub

> **Superseded.** Active development moved to the flagship site **ColdFront** at
> **https://coldfronthq.com** (repo [`Kshot3000/ColdFront`](https://github.com/Kshot3000/ColdFront)).
> This repo stays up for reference only and is an archive candidate.

An independent, fan-built website for the **Chicago Bears** — live scores, sharp odds, injury report, news, schedule, and stats. Built for fans, by a fan. No paywall, no corporate fluff.

**Live site:** https://kshot3000.github.io/THE-COLD-FRONT-CHICAGO/

## What's inside

| Section | What you get | Data source |
|---|---|---|
| **Home / Next Game** | Next Bears game with moneyline, spread, O/U, win% from Polymarket & Kalshi | ESPN + Kalshi + Polymarket |
| **Today's Scoreboard** | All NFL games, live scores, Bears game highlighted | ESPN (live) |
| **Odds** | Side-by-side Vegas (DraftKings via ESPN) vs Polymarket vs Kalshi for the next Bears game + Bears prediction-market movers | ESPN · [Polymarket](https://polymarket.com) · [Kalshi](https://kalshi.com) |
| **News** | Live NFL feed with a Bears-only filter, refreshed continuously | ESPN |
| **Standings** | NFC North, NFC & AFC tables, Bears highlighted | ESPN (live) |
| **Schedule** | Full 2026 slate, results, "up next" marker, bye week | ESPN (live) |
| **Injuries** | ESPN injury report, color-coded status | ESPN |
| **Roster & Stats** | Full roster by unit with season stats | ESPN |
| **About / Donate** | Dev info + Bitcoin donation | — |

## Data architecture

Everything is fetched **live in the browser** — no backend, no API keys, no server costs:

- **ESPN public site API** (`site.api.espn.com`) — scores, schedule, standings, news, roster, injuries. CORS-open.
- **Polymarket Gamma API** (`gamma-api.polymarket.com`) — prediction markets, including per-game moneylines and spreads. CORS-open.
- **Kalshi Trade API** (`api.elections.kalshi.com`) — regulated exchange prices. Blocks cross-origin browser requests (403), so the app falls back to public CORS proxies and shows a direct `kalshi.com` deep-link when all routes are down. Kalshi NFL market ticker format: `KXNFLGAME-<YYMMDD><AWAY><HOME>-<TEAM>`.
- **Seed data** in `js/data.js` (2026 schedule, team list) keeps the site useful offline or if a fetch fails.

> Odds are informational only and may lag the books. Not affiliated with the NFL, ESPN, DraftKings, Kalshi, or Polymarket.

## Stack

- Pure **HTML + CSS + vanilla JS** — zero build step, zero dependencies (QR code lib via CDN for the BTC address).
- Hosted on **GitHub Pages**.

## Deploy / update

Just push to `main` — GitHub Pages serves the repo root automatically.

To change the seed schedule (e.g. after a realignment or when new dates drop), edit `js/data.js` → `SEED_SCHEDULE`. Live data always takes precedence at runtime.

## Support the front ☕

If this keeps you informed, donations in BTC are appreciated:

```
3GnR7TWBXAB3pPztBWpNF4LMNEX5yX8vZK
```

## Dev

Built by [@kshot9000](https://x.com/kshot9000). Questions, corrections, or feature ideas? Hit me up on X.

---

*Unofficial fan site. Not affiliated with the NFL or the Chicago Bears. All team names, logos, and marks are the property of their respective owners.*
