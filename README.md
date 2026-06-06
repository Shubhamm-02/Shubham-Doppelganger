# Wizard - Shubham Shah AI Representative

Wizard is a live AI persona for Shubham Shah. It can answer questions about Shubham's background, skills, resume, and projects, and it can book a real interview through Cal.com without a human in the loop.

## Live Submission Links

- **Public chat:** `https://shubham-doppelganger.vercel.app/`
- **Voice agent:** `+1 651 477 8662`
- **Health check:** `https://shubham-doppelganger.vercel.app/api/health`
- **Eval report:** `docs/evals-report.md`
- **Demo checklist:** `docs/demo-checklist.md`

## What It Does

- Answers resume, education, skills, project, and role-fit questions using RAG.
- Discusses Shubham's project work with purpose, stack, tradeoffs, and lessons learned.
- Refuses unsupported or private questions instead of inventing facts.
- Provides a public chat UI with persistent sessions.
- Provides a callable Vapi/Twilio voice agent.
- Checks real Cal.com availability and books 15-minute interviews.
- Requires email confirmation before booking and blocks Shubham's own email as the attendee.

## Architecture

```text
Interviewer
  |-- Web chat: Next.js on Vercel
  |-- Phone call: Twilio number routed to Vapi
          |
          v
Shared Next.js API backend
  |-- /api/chat                 -> intent routing + RAG/calendar response
  |-- /api/vapi/tools           -> Vapi function tools
  |-- /api/calendar/availability -> Cal.com slot lookup
  |-- /api/calendar/book         -> Cal.com booking creation
  |-- /api/health                -> deployment health checks
          |
          v
Data and services
  |-- Supabase pgvector: resume/project chunks + conversation logs
  |-- Cal.com: real calendar availability and booking
  |-- Vapi: voice conversation, interruption handling, tool calls
  |-- Twilio: public phone number
```

## RAG Sources

The assistant is grounded on local source-of-truth files that are chunked, embedded, and uploaded to Supabase:

- `data/resume.md`
- `data/personal-background.md`
- `data/project-notes/*.md`

The current deployed index has 214 Supabase documents. `scripts/ingest-resume.ts` rebuilds and uploads the index.

## Key Flows

### Chat Q&A

1. User asks a profile/project question.
2. Backend retrieves relevant chunks through Supabase `match_documents`.
3. The answer is generated only from retrieved context.
4. Unsupported questions return a fixed refusal.

### Voice Q&A

1. Caller reaches the Twilio number.
2. Vapi assistant introduces itself as Wizard.
3. Profile questions call `search_profile`.
4. Scheduling questions use `get_availability` and `book_interview`.

### Booking

1. User asks to schedule.
2. Assistant asks for preferred day/date.
3. Cal.com returns available 15-minute slots.
4. User selects a slot.
5. Assistant collects name and Gmail username/email.
6. Backend normalizes Gmail usernames, confirms the email, and creates the booking.

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required environment variables:

```bash
OPENAI_API_KEY=
OPENAI_BASE_URL=
OPENAI_CHAT_MODEL=gpt-4.1-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

CAL_API_KEY=
CAL_EVENT_TYPE_ID=
CAL_USERNAME=
CAL_HOST_EMAILS=

VAPI_API_KEY=
VAPI_ASSISTANT_ID=
VAPI_TOOLS_URL=https://your-public-domain.com/api/vapi/tools
NEXT_PUBLIC_VAPI_PUBLIC_KEY=
NEXT_PUBLIC_VAPI_ASSISTANT_ID=
```

## Useful Commands

```bash
npm run dev              # local development
npm run build            # production build check
npm run ingest:resume    # chunk and upload resume/project data
npm run vapi:configure   # update live Vapi assistant prompt/tools
npm run evals            # run scripted eval prompts
```

## Deployment

The app is deployed on Vercel. After pushing to `main`, Vercel redeploys the chat UI and API routes. The Vapi assistant is configured separately through:

```bash
npm run vapi:configure
```

After deployment, verify:

```text
https://shubham-doppelganger.vercel.app/api/health
```

Expected result: `"ok": true`.

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

See `docs/evals-report.md`.

## Known Tradeoff

The current RAG index uses resume, personal background, and curated project notes rather than full commit-history crawling. This improves precision and keeps the demo reliable, but direct GitHub README and commit-history ingestion would be the next major improvement.
