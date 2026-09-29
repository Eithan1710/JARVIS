# NOVA — מערכת הפעלה אישית

A private, single-user **Personal AI Operating System**: habits, goals, check-ins, journal, metrics,
spending and calendar flow into one historical data model; a deterministic analytics engine finds
patterns; an AI orchestrator answers questions about your life from *computed facts*, never from raw
tables. Hebrew-first, fully RTL, installable PWA, built for iPhone and desktop.

Everything runs on free tiers: **Vercel Hobby** (hosting) · **Supabase Free** (Postgres) ·
**Google Gemini free tier** (AI, optional) · **GitHub Actions** (scheduler) · **Web Push** (notifications).

---

## Architecture

```
Browser (PWA, RTL)                    Next.js 16 (App Router, Node runtime)
┌──────────────────────┐             ┌──────────────────────────────────────────────────────┐
│ React 19 + Tailwind 4│  /api/*     │ route() wrapper: auth → zod validation → service      │
│ TanStack Query       │────────────▶│                                                        │
│  └ IndexedDB cache   │             │ services/      habits, goals, journal, data, memory,   │
│ Offline outbox (IDB) │             │                insights, reports, experiments, timeline│
│ Service worker       │             │ analytics/     day-frame · stats · habit-stats ·       │
│  └ shell cache, push │             │                compare · confidence · insights-engine  │
└──────────────────────┘             │ ai/            providers (Gemini/Groq/OpenRouter/Claude)│
                                     │                router (fallback chain, audit log)      │
                                     │                orchestrator: intent → plan → tools →   │
                                     │                context → model → validate → answer     │
                                     │ integrations/  registry · ICS · Health webhook · CSV ·  │
                                     │                weather · GitHub → imported_records      │
                                     │ notifications/ context-aware engine · web push         │
                                     │ jobs/          idempotent tick (cron)                  │
                                     └───────────────────────┬──────────────────────────────┘
                                                             │ Drizzle ORM
                                              Postgres (schema `nova`) — or PGlite locally
```

### Key principles
* **History, not state.** Every habit outcome is a dated `habit_events` row; metrics, transactions,
  check-ins and calendar events are time-series. Nothing is overwritten into a summary.
* **Provenance.** Imported data keeps its raw payload in `imported_records`; derived rows point back
  (`source_record_id`) and carry `source`. The *My data* screen shows value → source → import time → raw record.
* **Deterministic analytics first.** `analytics/dayframe.ts` aligns every signal per local day
  (missing = unknown, never 0). `stats.ts` / `compare.ts` compute means, medians, Spearman,
  Cohen's d, period comparisons, lagged (“next-day”) comparisons, weekday patterns, change points and
  confounders. The AI never does arithmetic.
* **Honest confidence.** `confidence.ts` maps sample size + effect size to high/medium/low with a
  Hebrew reason (“ביטחון בינוני — מבוסס על 27 ימים…”); weekday/weekend imbalance lowers it.
  Every insight has an evidence level (observation / correlation / temporal association / hypothesis).
* **AI never owns the database.** The orchestrator (`ai/orchestrator`) detects intent in Hebrew,
  plans a small set of tools, runs them over a Day Frame, and sends only numbered facts (`F1…Fn`) to
  the model. Answers must be JSON with typed points (fact / calculation / pattern / hypothesis /
  recommendation) citing fact ids; uncited claims are downgraded to hypotheses and causal wording
  triggers a caveat. Without AI, the same facts are returned as a deterministic answer.
* **Memory needs consent.** AI-suggested memories are stored as `proposed` and only become active
  when you confirm them.
* **Privacy.** Single passcode → signed HTTP-only session cookie. Integration secrets are AES-256-GCM
  encrypted. Logs never include personal content. Every AI call is audited in `ai_tasks` with data
  *categories and counts* only (visible in Settings → “מה נשלח ל־AI”). Journal text / individual
  transactions can be excluded from AI context in Settings.

### Model routing
`AI_PROVIDER_ORDER` defines the fallback chain (free tiers hit rate limits). Each task picks a tier:
`fast` (planning, daily brief), `balanced` (weekly review, experiments), `deep` (multi-variable “why”
questions). Models are configurable per tier via env vars.

### Smart reminders
`notifications/engine.ts` learns when a habit usually happens (separately for weekdays/weekends and
busy days), checks today's calendar, moves reminders after meetings, respects quiet hours, a daily
budget and a minimum gap, and stops nagging after repeated ignored reminders. Every notification
stores its reasoning (“למה בזמן הזה?”), shown in the app.

### PWA & offline
Manifest + icons + standalone display, safe-area aware layout, service worker (cache-first build
assets, network-first pages with cached fallback, offline page, push). Recent query results persist in
IndexedDB so the app opens instantly offline. Writes made offline go to an IndexedDB outbox, are shown
as “נשמר במכשיר”, and are replayed in order (idempotent endpoints) → “סונכרן”.

---

## Deploy (free) — ~10 minutes

1. **Database** — Supabase → your project → *Connect* → **Transaction pooler** connection string
   (port 6543). The `nova` schema is already created in the *HabitTracker AI* project and your 9 habits
   were imported. For a fresh database run `DATABASE_URL=… npm run db:migrate`.
2. **Vercel** — vercel.com/new → import `Eithan1710/NOVA` → add environment variables
   (see `.env.example`): `DATABASE_URL`, `APP_PASSCODE`, `SESSION_SECRET`, `ENCRYPTION_KEY`,
   `CRON_SECRET`, `GEMINI_API_KEY` (free: https://aistudio.google.com/apikey), `VAPID_PUBLIC_KEY`,
   `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Deploy. (`vercel.json` pins the function region to Seoul,
   next to the Supabase database.)
3. **Scheduler** — GitHub repo → Settings → Secrets → Actions: `NOVA_URL` (your Vercel URL) and
   `CRON_SECRET`. `.github/workflows/scheduler.yml` then runs the jobs every 30 minutes (insights,
   daily brief, weekly review, integration sync, reminders).
4. **iPhone** — open the URL in Safari → Share → *Add to Home Screen* → open NOVA from the home screen
   → Settings → enable notifications.

## Local development

```bash
npm install
npm run dev          # http://localhost:3000 — no env needed: embedded Postgres (PGlite) in .data/
npm test             # unit + end-to-end service tests (in-memory Postgres)
npm run typecheck
npm run build
```
Load 100 days of realistic demo data from the home screen or Settings → נתונים; remove it in one tap.

## Integrations
| Source | How | Data |
|---|---|---|
| Apple Health | iOS Shortcuts automation → private webhook (`/api/ingest/<token>`); also accepts *Health Auto Export* JSON | sleep, bedtime, steps, workouts, HR, HRV, weight, protein |
| Google / Outlook calendar | private ICS link (no OAuth), recurring events expanded | events, meeting load |
| CSV | bank / card exports or any `date,metric,value` file, with preview | transactions (auto-categorised), metrics |
| Weather | Open-Meteo (no key) | daily max temp, precipitation |
| GitHub | public events API (+ optional token) | commits per day |

New sources implement `IntegrationDefinition` (`src/server/integrations/types.ts`) and return
`NormalizedRecord`s; `ingestRecords()` handles provenance, idempotency and habit auto-completion.

## Data model (schema `nova`)
`users` · `habits` · `habit_events` · `goals` · `goal_milestones` · `goal_habits` · `goal_progress` ·
`daily_checkins` · `journal_entries` · `metrics` · `metric_definitions` · `transactions` ·
`calendar_events` · `integrations` · `imported_records` · `memories` · `insights` · `insight_evidence` ·
`reports` · `experiments` · `notifications` · `notification_events` · `push_subscriptions` ·
`ai_conversations` · `ai_messages` · `ai_tasks` · `job_runs`. Every user-owned row has `user_id`, so
real multi-user auth only changes how `UserContext` is resolved (`src/server/context.ts`).
