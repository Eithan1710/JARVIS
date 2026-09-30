# JARVIS

עוזר אישי שמדברים איתו — וזהו. מאחורי הקלעים: מוביל (Leader) שמחליט מה לעשות, מומחים שנוצרים לפי הצורך, כלים, זיכרון ארוך טווח, תזכורות, הרגלים ויעדים.

A personal AI assistant with a single Hebrew chat interface. One Leader model understands each request and decides whether to answer, call tools, or spin up purpose-written specialist Workers on other free AI providers. Everything is remembered; only what's relevant is loaded.

**Stack:** Next.js 16 · React 19 · Tailwind 4 · Drizzle · Postgres (Supabase) · Gemini + Groq + Mistral (free tiers) · Web Push · Supabase Cron. Runs at **$0**.

→ Architecture: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## What it can do today
- Talk (text or voice, Hebrew by default) — replies stream status lines like ״מחפש במידע ששמרת…״, with an optional ״פרטים״ view.
- Remember: long-term memory (explicit ״תזכור ש…״ and automatic), plus a searchable complete history.
- Reminders in natural language (one-off and recurring), delivered as push notifications + a chat message.
- Habits with daily nudges, streaks and "already done — no nagging".
- Goals with measurable progress and automatic check-ins.
- To-dos.
- Open things: any link, YouTube, Spotify search, navigation (Waze / Google / Apple Maps), GitHub, pre-filled calendar events.
- Research: web search (Tavily, or Wikipedia without a key), read any public page, read GitHub repos and activity.
- Delegate: long writing, analysis and code review go to Workers the Leader writes on the fly.

## Deploy (free, ~15 minutes)
1. **Keys** (all free, no card):
   - Gemini — https://aistudio.google.com/apikey
   - Groq — https://console.groq.com/keys
   - Mistral — https://console.mistral.ai/api-keys (Experiment plan; phone verification). Optional: turn off *Anonymous improvement data* in Admin → Privacy.
   - Web push keys — `npm run vapid`
2. **Database** — Supabase → project → *Connect* → **Transaction pooler** URI (port 6543). Tables are created automatically in the `jarvis` schema on first start (existing schemas, e.g. `nova`, are untouched).
3. **Vercel** — import this repo → add the variables from `.env.example` (`DATABASE_URL`, `APP_PASSCODE`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `CRON_SECRET`, `GEMINI_API_KEY`, `GROQ_API_KEY`, `MISTRAL_API_KEY`, `VAPID_*`) → deploy. `vercel.json` pins functions to Seoul, next to the Supabase database.
4. **Scheduler** — Supabase → SQL editor → run `scripts/supabase-cron.sql` with your app URL and `CRON_SECRET` (every-minute ticks → on-time reminders). Optional hourly backup: GitHub secrets `JARVIS_URL` + `CRON_SECRET`.
5. **iPhone** — open the URL in Safari → Share → *Add to Home Screen* → open JARVIS from the home screen → menu → enable notifications.

## Local development
```bash
npm install
npm run dev     # http://localhost:3000 — embedded Postgres (PGlite), no env needed; add GEMINI_API_KEY to talk
npm test        # recurrence, tools, and full Leader/scheduler flows against an in-memory database
npm run typecheck && npm run build
```

## Extending
- **Tool**: write a `defineTool({...})` in `src/server/tools/builtin/` and list it in `src/server/tools/registry.ts`.
- **AI provider**: add an OpenAI-compatible config in `src/server/ai/providers/openai-compatible.ts` and a line in `ROUTES` (`src/server/ai/router.ts`) — or set `EXTRA_AI_*` env vars with no code at all.
- **Connection**: add a definition in `src/server/connections/registry.ts` (+ OAuth callback and tools).

## History
This repository previously held **NOVA** (a personal-data dashboard). Its final state is tagged `nova-final`; its `nova` database schema is left as-is.
