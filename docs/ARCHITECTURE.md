# JARVIS — architecture

> Simple outside. Powerful inside. The user only talks to JARVIS; everything below is invisible to them.

```
Browser (Hebrew RTL PWA)                         Next.js 16 on Vercel (Node runtime)
┌──────────────────────────────┐   /api/chat    ┌───────────────────────────────────────────────────────────┐
│ Chat · voice · push · links  │──── NDJSON ───▶│ brain/turn     save user msg → Leader → save reply         │
│  steps stream in as quiet    │◀── events ─────│ brain/leader   JSON decision loop (≤4 rounds):            │
│  status lines                │                │                answer │ tools (parallel) │ workers (parallel)│
└──────────────────────────────┘                │ brain/context  memory + live goals/habits/reminders/tasks  │
        ▲ web push                              │                + current thread + retrieved past snippets  │
        │                                        │ brain/workers  Leader-written role+task → worker_deep/fast │
┌───────┴──────────┐  every minute   /api/cron/tick                                                         │
│ Supabase Cron    │───────────────▶│ scheduler/tick  due reminders, habit nudges, goal check-ins →        │
│ (pg_cron+pg_net) │                │                 chat message + push                                    │
└──────────────────┘                │ ai/router       roles → provider chains, failover, cooldowns, audit   │
                                    │ tools/registry  26 tools; add one object to add a capability          │
                                    │ connections/    GitHub, web search, web pages; OAuth sources later     │
                                    └──────────────────────────────┬────────────────────────────────────────┘
                                                                   │ Drizzle ORM
                                                  Postgres schema `jarvis` (Supabase) — PGlite locally
```

## The Leader
One call per round returns a JSON decision:

```json
{"actions": [{"tool": "create_reminder", "args": {…}}, {"worker": {"title": "…", "role": "…", "task": "…", "context": "…", "speed": "deep"}}],
 "reply": "…", "final": true}
```

* No actions → the reply is the answer (most turns: one model call).
* Predictable actions + reply + `final: true` → actions run, and the reply is shown **only if every action succeeded**; otherwise the errors go back to the Leader, so JARVIS never claims something it didn't do.
* Information-gathering actions → observations `[1] [2] …` are fed back and the Leader continues. `{{result:N}}` embeds a worker's full output without re-generating it.
* The protocol is plain JSON, not provider-specific function calling, so any provider can be the Leader when Gemini is rate limited.

## Providers and roles (`src/server/ai/router.ts`)
| Role | Chain | Why |
|---|---|---|
| `leader` | Gemini large → Mistral large → Groq large | best tool use + Hebrew; others keep JARVIS alive |
| `worker_deep` | Mistral large → Groq large → Gemini large | quality work off the Leader's quota |
| `worker_fast` | Groq large → Gemini light → Mistral small | speed |
| `light` (memory, titles) | Groq small → Gemini light → Mistral small | cheap background chores |
| transcription | Groq Whisper → Gemini | Hebrew speech-to-text |

A 429 puts a provider on a 60 s cooldown (shared via `ai_providers`). Every attempt — successful or not — is stored in `prompts` with the full system prompt, input and output. Adding a provider: an `OpenAICompatibleProvider` config (or a class) + a line in `ROUTES`.

## Memory vs history
* **History** — `messages`, `prompts`, `tool_calls`, `workers`, `worker_runs`: append-only, everything. Retrieved on demand (`search_history`, plus up to 4 keyword-matched snippets from other conversations each turn). Archiving a conversation only hides it from the list.
* **Long-term memory** — `memories`: a small curated set. Written explicitly (`save_memory` when asked) or by a background extractor after each turn (light model; de-duplicated; secrets excluded). Loaded into every Leader prompt.

## Goals, habits, reminders
* Reminders: natural-language → the Leader resolves the local time from a 7-day calendar in its prompt → `create_reminder` converts local wall-clock time in the user's timezone (DST-safe). Recurrence: daily / weekly on weekdays / monthly, with intervals.
* Habits: a habit + a linked recurring reminder. The nudge is skipped when the habit is already logged that day. Streaks and the last 7 days are computed from `habit_logs`.
* Goals: optional metric (unit/start/target/current), progress log, automatic check-ins every N days.
* The scheduler claims due rows with `FOR UPDATE SKIP LOCKED`, so overlapping ticks never double-deliver.

## Tools and connections
Tools (`src/server/tools/builtin`): memory ×3, history, reminders ×3, tasks ×3, goals ×3, habits ×4, open_url / open_youtube / open_spotify / open_maps / open_github, create_calendar_event (pre-filled Google Calendar link), search_web (Tavily → Wikipedia), fetch_url (SSRF-guarded), read_github.

Opening things happens **in the browser**: tools return a `ClientAction` rendered as a one-tap button (browsers block pop-ups not triggered by a tap, and a web app can't drive native apps).

Connections (`src/server/connections/registry.ts`) describe external sources and where their credentials come from: an encrypted per-user secret in `connections`, else a server env key. Planned OAuth connections (Google Calendar/Gmail/Drive, Spotify playback) and an Apple Health webhook (iOS Shortcut → public `/api/hooks/*`, already allow-listed in the proxy) plug in here plus their tools — the Leader needs no changes.

## Security
* Secrets only in server env; nothing sensitive reaches the client bundle.
* Passcode → signed HTTP-only `SameSite=Lax` cookie (180 days), brute-force throttle, request proxy gates every page/API.
* Every query is scoped by `user_id` via `UserContext`; moving to Supabase Auth changes only `getUserContext()`.
* The app connects as the schema owner; RLS is enabled with no policies, so Supabase's public REST roles see nothing.
* Connection tokens are AES-256-GCM encrypted. Logs never contain message content.
* `fetch_url` blocks private/loopback/link-local addresses and re-checks each redirect.

## Data model (schema `jarvis`)
`users` · `conversations` · `messages` · `prompts` · `memories` · `goals` · `habits` · `habit_logs` · `reminders` · `tasks` · `tool_calls` · `workers` · `worker_runs` · `ai_providers` · `connections` · `push_subscriptions` · `job_runs`. SQL in `src/server/db/migrations.ts` (applied automatically on first connection), types in `src/server/db/schema.ts`.

## Limits worth knowing
* Gemini free tier: ~15 RPM / ~1,500 RPD for Flash; prompts may be used by Google to improve products.
* Groq free: 8K tokens/minute per model — fast workers get trimmed context.
* Push on iPhone requires iOS 16.4+ and *Add to Home Screen*.
* Search on history is keyword-based (substring, Hebrew-prefix aware). Semantic search (pgvector + free Gemini embeddings) is the natural next step.
