# Swing Trainer

**A private trade-journal and practice tool for swing traders — logs your trades, quizzes you on chart patterns, and uses Claude to debrief every position you close.**

Swing Trainer is the tool I wish existed when I was learning to swing-trade. It's a personal journal that goes beyond "log the trade" into pattern drills, playbook adherence scoring, and AI-generated trade debriefs. Full-stack, self-hosted, Claude-powered.

_Status: Active personal use · Self-hosted on Railway · Not on any app store_

---

## What it does

- **Trade journal.** Log equity and option-spread trades (bull put, bear call, bull call, bear put). Max gain, max loss, and breakeven are computed automatically for spreads.
- **AI trade debriefs.** Claude Sonnet analyzes each closed trade against your playbook — what worked, what didn't, what you'd do differently.
- **Pattern drills.** A 104-question drill bank with synthetic candle charts. Test your recognition of flags, wedges, breakouts, breakdowns.
- **Playbook adherence scoring.** Define your entry/exit rules once; every trade gets scored against them.
- **Setup selector.** Multi-strategy detector across trend/pullback signals (SMA, RSI, volume, 52-week highs) with hard-gate filters.
- **Bull assistant.** Scheduled auto-log that runs your setup detectors nightly and surfaces candidates for tomorrow.
- **Watchlist + curriculum.** A structured learning progression from beginner drills through advanced setups.

## Under the hood

- **Backend:** FastAPI + SQLite + SQLAlchemy. Single-file model layer, one router per domain (trades, playbook, progress, market, watchlist, train, tips, curriculum, admin, users, auth).
- **Frontend:** React + Vite. `lightweight-charts` v5 for OHLC rendering.
- **AI:** Anthropic API — Claude Sonnet 4.6 for trade debriefs, Haiku 4.5 for daily tips and pattern analysis. Prompt caching on the coaching-context system block.
- **Market data:** Finnhub + TwelveData with in-memory TTL cache.
- **Auth:** Google OAuth via session cookies, with an approval-workflow gate on `ALLOWED_EMAILS`.
- **Deploy:** Single-process on Railway — FastAPI serves both the REST API and the pre-built React SPA.

## Local development

Prerequisites: Python 3.11+, Node 20+, an Anthropic API key.

**Backend** (from project root):
```bash
DEV_BYPASS_AUTH=true uvicorn backend.main:app --host 0.0.0.0 --port 7432 --reload
```

**Frontend** (from `frontend/`):
```bash
npm run dev       # Vite on :5173, proxies /api and /auth to :7432
npm run build     # required before deploy
```

**Tests** (from project root):
```bash
pytest
```

## Environment variables

| Variable | Purpose |
|---|---|
| `DEV_BYPASS_AUTH` | `true` skips all auth, uses first DB user |
| `ANTHROPIC_API_KEY` | Claude API — AI features degrade gracefully if absent |
| `DATABASE_URL` | SQLite file path |
| `ALLOWED_EMAILS` | Comma-separated allowlist for Google OAuth |
| `FINNHUB_API_KEY` / `TWELVEDATA_API_KEY` | Market data providers |

See `.env.example` for the full list.

## Status

Active personal use — I log my own swing trades against it. Not on any app store; self-hosted for one user. Multi-user seams stubbed but not exercised. Ongoing work on the `feature/bull-assistant` branch: automated overnight candidate detection and stricter setup gates.

---

## Author

**Hernan Rosenblum** — Senior Data Scientist / Applied ML Engineer.
[LinkedIn](https://www.linkedin.com/in/hernanros) · [hernan.rosenblum89@gmail.com](mailto:hernan.rosenblum89@gmail.com)
