# Wizard - Shubham Shah AI Representative

Wizard is a live AI persona for Shubham Shah. It can answer questions about Shubham's background, skills, resume, and projects, and it can book a real interview through Cal.com without a human in the loop.

## Live Submission Links

- **Public chat:** `https://shubham-doppelganger.vercel.app/`
- **Voice agent:** `+1 651 477 8662`
- **Health check:** `https://shubham-doppelganger.vercel.app/api/health`
- **Eval report:** [`docs/evals-report.pdf`](docs/evals-report.pdf)
- **Demo checklist:** [`docs/demo-checklist.md`](docs/demo-checklist.md)
- **Architecture:** [`docs/architecture.md`](docs/architecture.md)

## What It Does

- Answers resume, education, skills, project, and role-fit questions using RAG, with source chips for every grounded answer.
- Discusses Shubham's project work with purpose, stack, tradeoffs, and lessons learned.
- Refuses unsupported or private questions instead of inventing facts.
- Provides a public chat UI with private, per-visitor chat history: rename, delete with undo, stop, retry, and regenerate.
- Provides a callable Vapi/Twilio voice agent, and a voice button in the web UI.
- Checks real Cal.com availability and books 15-minute interviews, by typing or through the slot picker.
- Confirms the booking before creating it and blocks Shubham's own email as the attendee.

## Architecture

```text
Interviewer
  |-- Web chat: Next.js on Vercel (streams answers over SSE)
  |-- Phone call: Twilio number routed to Vapi
          |
          v
Shared Next.js API backend (route handlers, Node.js runtime)
  |-- /api/chat/stream, /api/chat  -> rate limit -> session -> intent router -> profile answer | booking
  |-- /api/sessions[/:id]          -> list, rename, delete the visitor's chats
  |-- /api/conversations           -> paged chat history
  |-- /api/vapi/tools              -> Vapi function tools (shared secret)
  |-- /api/health                  -> deployment health check
          |
          v
Data and services
  |-- OpenAI: grounded answers, intent routing, embeddings
  |-- Supabase Postgres + pgvector: profile chunks, chat sessions, turns, booking state
  |-- Upstash Redis: rate limits
  |-- Cal.com: real calendar availability and booking
  |-- Vapi + Twilio: voice conversation and public phone number
```

[`docs/architecture.md`](docs/architecture.md) covers the request lifecycle, endpoint contracts, the scheduling state machine, retrieval, the data model, the security model, logging, and every environment variable.

## RAG Sources

The assistant is grounded on source-of-truth Markdown files that are chunked by section, embedded, and uploaded to Supabase:

- `data/resume.md`
- `data/personal-background.md`
- `data/project-notes/*.md` (curated project notes)
- `data/github/*.md` (README snapshots of public GitHub repos, written by `npm run ingest:github`)

`npm run ingest:resume` rebuilds the index: it upserts every chunk and deletes chunks whose source is gone.

## Key Flows

### Chat Q&A

1. The visitor asks a profile or project question.
2. The router classifies the message (regex fast path, then a small LLM classifier that also rewrites follow-ups into standalone questions).
3. The backend retrieves relevant chunks through Supabase `match_documents`, or local keyword search when Supabase or OpenAI is not configured.
4. The answer streams back, generated only from the retrieved chunks, with the chunks shown as sources.
5. Unsupported questions return a fixed refusal.

### Voice Q&A

1. The caller reaches the Twilio number.
2. The Vapi assistant introduces itself as Wizard.
3. Profile questions call `search_profile`.
4. Scheduling questions use `get_availability` and `book_interview`.

### Booking

1. The visitor asks to book a call, or opens the slot picker.
2. They choose a day; Cal.com returns open 15-minute slots (Asia/Kolkata).
3. They pick a slot and give their name and email (Gmail usernames are completed to `@gmail.com`).
4. The assistant reviews the booking and books it only after a yes (or the form's confirm button).
5. The reply becomes a booking card with the meeting link (when Cal.com returns one) and an `.ics` download.

Booking state is saved per chat, so a reload or a second tab continues the same booking and cannot book twice.

## Local Setup

Requires Node.js 22.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

With an empty `.env.local` the app still runs: chat answers from local keyword search, sessions live in memory, and booking replies that the calendar is not connected. Add keys from [`.env.example`](.env.example) to enable each service; the full table is in [`docs/architecture.md`](docs/architecture.md#environment-variables).

To use Supabase, apply the SQL files in this order (Supabase SQL editor, or `psql "$DATABASE_URL" -f <file>`; each file is safe to re-run), then build the index:

1. `supabase/schema.sql`
2. `supabase/migrations/20261016120000_visitor_scoped_sessions.sql`
3. `supabase/migrations/20261016140000_scheduling_state.sql`

```bash
npm run ingest:github -- --dry-run   # optional: preview which public repos get README snapshots
npm run ingest:github                # optional: write data/github/*.md (GITHUB_TOKEN raises the API limit)
npm run ingest:resume                # embed and upload all chunks (prints the inventory only without keys)
```

## Useful Commands

```bash
npm run dev              # local development
npm run build            # production build
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
npm test                 # Vitest unit tests
npm run check            # lint + typecheck + tests
npm run evals            # answer the scripted eval questions and print answers and sources
npm run ingest:github    # refresh GitHub README snapshots in data/github
npm run ingest:resume    # chunk, embed and upload data/ to Supabase
npm run vapi:configure   # update the live Vapi assistant prompt and tools
```

CI (`.github/workflows/ci.yml`) runs `npm ci`, lint, typecheck, tests, build, and an offline `npm run evals` on every pull request and on pushes to `main`. It needs no secrets.

## Deployment

The app is deployed on Vercel. After pushing to `main`, Vercel redeploys the chat UI and API routes.

Before deploying, apply the three SQL files above. Without the migrations, chat still answers, but sessions, history, and multi-turn booking are not saved, and `/api/health` reports 503.

Set `VISITOR_COOKIE_SECRET`, `VAPI_WEBHOOK_SECRET`, and the Upstash variables in Vercel before deploying. `/api/vapi/tools` rejects calls without the `x-vapi-secret` header, so right after the deploy, run the assistant configuration with the same `VAPI_WEBHOOK_SECRET` in your local env. Voice tool calls fail with 401 until you do:

```bash
npm run vapi:configure
```

After deployment, verify:

```text
https://shubham-doppelganger.vercel.app/api/health
```

Expected result: `"ok": true`. Send `x-health-token: $HEALTH_TOKEN` to see which check failed:

- `API key not valid` with a `baseURL` on `generativelanguage.googleapis.com`: an OpenAI key is going to Gemini. Clear `OPENAI_BASE_URL`, or use a Gemini key and update the embedding dimensions and schema.
- `Could not find the function public.match_documents`, or a missing table or column: apply the SQL files above, then rerun `npm run ingest:resume`.
- `The documents table is empty`: the schema exists but `npm run ingest:resume` has not run.

## Cost Breakdown

Approximate cost depends on call length and provider pricing, but this build was designed to stay lightweight.

| Item | Approximate cost driver |
| --- | --- |
| Chat session | LLM tokens for answer generation + Supabase request; typically a few cents or less for short sessions. |
| Voice call | Vapi/Twilio minutes + model/STT/TTS usage; roughly proportional to call duration. |
| Calendar booking | Cal.com API usage; no meaningful per-booking compute cost in this app. |
| Database | Supabase free/low-tier storage and vector queries for this small corpus. |
| Hosting | Vercel free/low-tier serverless usage for the demo workload. |

## Evaluation

The eval report covers:

- Voice latency and booking task completion.
- Chat groundedness and refusal behavior.
- Retrieval quality over the indexed corpus.
- Three failure modes and fixes.
- Tradeoff and two-week improvement plan.

See [`docs/evals-report.pdf`](docs/evals-report.pdf). `npm run evals` replays the scripted questions against the current answer path and prints each answer, whether it was grounded, and its sources; it uses vector retrieval and the LLM when keys are set and local keyword search otherwise. Unit tests (`npm test`) cover routing, date and time parsing, email handling, slot selection, the scheduling flow, stores, rate limits, and the SSE codec.

## Known Tradeoff

The index uses the resume, personal background, curated project notes, and GitHub README snapshots rather than full commit history. This keeps retrieval precise and the demo reliable; commit-history ingestion would be the next improvement.
