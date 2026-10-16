# Architecture

## System

```text
Visitor (browser)                       Caller (phone)
  |  Next.js UI: app/page.tsx,            |  Twilio number -> Vapi assistant
  |  components/, hooks/, lib/client/     |  (configured by npm run vapi:configure)
  v                                       v
POST /api/chat/stream (SSE)             POST /api/vapi/tools (x-vapi-secret)
GET/PATCH/DELETE /api/sessions[/:id]      search_profile | get_availability | book_interview
GET /api/conversations                    |
  |                                       |
  v                                       v
lib/chat/handle-message.ts  --------->  lib/profile/answer.ts      lib/calendar/*
  router -> profile | scheduling          retrieval + grounded LLM   Cal.com v2 slots/bookings
  lib/store (Supabase or memory)          (OpenAI)
  lib/rate-limit (Upstash or memory)
  |
  v
Supabase Postgres + pgvector: documents, chat_sessions, conversations
```

Everything runs as Next.js route handlers on the Node.js runtime (Vercel). There is no separate
backend service.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/chat/stream` | One chat turn as Server-Sent Events. Used by the web UI. |
| POST | `/api/chat` | The same turn as a single JSON `ChatDone` (499 if the client disconnects). |
| GET | `/api/sessions?limit=` | The visitor's chats, newest first (default 30, max 50). |
| PATCH | `/api/sessions/:id` | Rename: `{ "title": "1-80 chars" }` -> `{ session }`. |
| DELETE | `/api/sessions/:id` | Delete a chat and its turns -> `{ "ok": true }`. |
| GET | `/api/conversations?sessionId=&before=&limit=` | A page of turns, oldest first; `nextCursor` is the `before` for the next page (default 20, max 50). |
| POST | `/api/vapi/tools` | Vapi tool calls. 401 without a matching `x-vapi-secret`, 503 when the secret is not configured. |
| GET | `/api/health` | `{ ok }` (200/503). With a matching `x-health-token`, the full check details. |

Chat request body (`lib/chat/schema.ts`):
`{ message (1-2000 chars), sessionId?, action?, replaceTurnId? }`, where `action` is
`{ type: "check_day", dateKey: "YYYY-MM-DD" }` or `{ type: "book", slotId, name, email }`, and
`replaceTurnId` regenerates the latest answer (profile answers only; not combinable with `action`).

Errors are always `{ "error": { "code", "message", "retryAfter"? } }` (`lib/http.ts`):
400/415 `invalid_request`, 401 `unauthorized`, 404 `not_found`, 429 `rate_limited` (with a
`Retry-After` header), 503 `unavailable`, 500 `internal`.

SSE events (`lib/chat/types.ts`, encoded and parsed by `lib/chat/sse.ts`):
`meta { sessionId }` -> `status { stage: searching | checking_calendar | booking }` ->
`token { token }`... -> `done ChatDone` or `error { code: "internal", message }`.
`ChatDone` is `{ turnId, sessionId, answer, intent, grounded, sources, scheduling }`.

## Chat request lifecycle

`startChatTurn` does everything that can fail with a real HTTP status before the stream opens:

1. `Content-Type` must be `application/json` (415 otherwise), which forces a CORS preflight so
   other sites cannot drive chat from a visitor's browser.
2. Body parsed with zod (400).
3. `getVisitor()` reads or mints the signed visitor cookie (503 if the secret is missing in
   production).
4. `limitChatRequest`: 20 requests per visitor and 60 per IP (IPv6 counted per /64) in a sliding
   5-minute window (429).
5. Session: an existing `sessionId` must belong to the visitor (404); without one, a session is
   created and titled from the message. The last 6 turns become history. A store outage degrades
   to answering without a session.

`runChatTurn` then streams:

6. `meta`, then routing (`lib/chat/router.ts`): a `book` / `check_day` action goes straight to
   scheduling; otherwise a regex fast path, then an LLM classifier (`OPENAI_ROUTER_MODEL`, falling back to Groq; 4 s
   timeout per provider, structured output, rewrites follow-ups into standalone questions), then a heuristic
   fallback when there is no key or the call fails. Intents: `profile`, `scheduling`,
   `cancel_scheduling`.
7. Profile: `status searching`, retrieval, then the grounded answer streams as `token` events.
   Scheduling: claim the session's scheduling state, advance the state machine (`status
   checking_calendar` / `booking` around Cal.com calls), send the reply as one `token`.
8. Persist the turn once (append, or replace for regenerate) with metadata: intent, sources,
   scheduling snapshot, `stopped`. A new chat is re-titled from the first exchange unless renamed.
9. `done`. If the client aborts, the partial answer is saved with `stopped: true` and no `done` is
   sent. Failures after the stream opened become an `error` event.
10. One structured log line (see Observability).

## Modules

| Path | Responsibility |
| --- | --- |
| `app/api/**` | Route handlers; thin wrappers over `lib/`. |
| `lib/chat/` | Orchestrator (`handle-message.ts`), intent router, request schema, SSE codec, scheduling lock, shared wire types. |
| `lib/scheduling/` | Scheduling state (zod-validated JSON) and the pure state machine (`flow.ts`). |
| `lib/calendar/` | Cal.com client, slot search and selection, booking, date/time parsing in Asia/Kolkata, email extraction and host-email blocking, Vapi calendar tools. |
| `lib/profile/` | Profile answers: question classification, local keyword search, project digest, source chips. |
| `lib/llm/` | OpenAI client and model config, embeddings, grounded-answer prompt and streaming. |
| `lib/retrieval/` | Supabase `match_documents` vector retrieval. |
| `lib/store/` | `ChatStore` interface with Supabase and in-memory implementations, cursor paging. |
| `lib/github/` | GitHub API client, README cleanup and snapshot rendering for `ingest:github`. |
| `lib/chunking.ts`, `lib/profile-data.ts`, `lib/vector-store.ts` | Load `data/`, chunk by Markdown section, upsert and prune `documents`. |
| `lib/visitor.ts`, `lib/rate-limit.ts`, `lib/secure-compare.ts`, `lib/http.ts`, `lib/logger.ts` | Visitor cookie, rate limits, constant-time compare, error responses, request log line. |
| `lib/session-titles.ts`, `lib/profile-summary.ts` | Chat titles; the landing-page profile summary. |
| `components/`, `hooks/`, `lib/client/` | The web UI: thread, composer, sidebar, booking cards (slot picker, form, review, `.ics`), voice panel; client state reducer, API client, error mapping. |
| `scripts/` | `ingest-resume`, `ingest-github`, `configure-vapi-assistant`, `run-evals`. |

## Scheduling state machine

State lives in `chat_sessions.scheduling` (`lib/scheduling/state.ts`); transitions are in
`lib/scheduling/flow.ts`. All times are Asia/Kolkata; calls are 15 minutes.

| From | Input | To |
| --- | --- | --- |
| `idle` / `booked` | booking request without a day | `awaiting_day` |
| any | a day (typed, or `check_day` action) | `awaiting_slot` with up to 6 slots; `awaiting_day` if none, the day has passed, or Cal.com is down |
| `awaiting_slot` | a number, ordinal or time | `awaiting_details` if name or email is missing, else `awaiting_confirmation` |
| `awaiting_details` | name and/or email | `awaiting_confirmation` once both are known |
| `awaiting_confirmation` | yes | `booked` (Cal.com `POST /bookings`) |
| `awaiting_confirmation` | no, or a new day, time, name or email | stays and asks what to change; a change re-runs that step |
| `awaiting_slot` | `book` action (slot picker form) | `booked`; the form's review step is the confirmation |
| booking attempt | slot taken | `awaiting_slot` with fresh slots, the taken one excluded |
| booking attempt | attendee rejected or host email | `awaiting_details` with the email cleared |
| booking attempt | unknown Cal.com error | `awaiting_confirmation` ("reply yes to try again") |
| booking attempt | booking limit reached / calendar not configured | `idle` |
| any active step | cancel | `idle` (a booked call stays booked; the invite link handles changes) |

Guards: an active state untouched for 24 hours restarts at `idle`; a repeated `book` action on a
booked state replays the confirmation instead of booking twice; Shubham's own addresses
(`CAL_HOST_EMAILS`) are never accepted as the attendee; Gmail usernames are completed to
`@gmail.com`. Concurrency: a turn claims the state with `lockedAt` (expires after 60 s) and every
save is a compare-and-set on `chat_sessions.scheduling_version`, so a double click or a second tab
cannot book twice or overwrite a newer state.

Voice booking does not use this machine: Vapi keeps the conversation, and
`lib/calendar/voice-tools.ts` answers `get_availability` (3 slots) and `book_interview`
(requires name, email and `emailConfirmed`) statelessly.

## Retrieval

- Sources: `data/resume.md`, `data/personal-background.md`, `data/project-notes/*.md`, and the
  GitHub README snapshots in `data/github/*.md`. Chunked by Markdown section (`lib/chunking.ts`).
- `npm run ingest:github` (optional, `--dry-run` supported) writes `data/github/` from the public
  repos of `GITHUB_OWNER`, skipping forks, archived repos, repos created before the cutoff in
  `scripts/ingest-github.ts`, and repos a curated note already covers.
- `npm run ingest:resume` embeds every chunk, upserts `documents` on `(source_path, chunk_index)`
  and deletes rows for files that are gone or chunks past a file's new end. Without OpenAI and
  Supabase keys it only prints the chunk inventory.
- Chat (`lib/profile/answer.ts`): questions about this project or broad "who is he" questions use
  curated chunks; project-list questions get a digest; everything else uses vector search when
  OpenAI and Supabase are configured (`match_documents`, top 14 at cosine similarity >= 0.12,
  boilerplate sections dropped, 10 kept; constants in `lib/retrieval/vector.ts`) and local keyword
  search otherwise or on failure. Voice always uses local keyword search for latency.
- The grounded answer is generated only from the retrieved chunks; when they do not support an
  answer the model returns the fixed refusal and no sources are shown. Without an OpenAI key the
  reply is an extractive summary of the top 4 chunks.

## Data model and migrations

| Table | Columns that matter |
| --- | --- |
| `documents` | `source_type`, `source_name`, `source_path`, `source_url`, `chunk_index`, `content`, `content_hash`, `embedding_model`, `metadata`, `embedding vector(1536)`; unique `(source_path, chunk_index)`, HNSW cosine index. |
| `chat_sessions` | `id`, `title`, `visitor_id`, `created_at`, `updated_at`, `scheduling jsonb`, `scheduling_version`. |
| `conversations` | `id`, `session_id` (FK, `on delete cascade`), `channel` (`chat`), `user_message`, `assistant_message`, `retrieved_document_ids`, `grounded`, `latency_ms`, `metadata jsonb`, `created_at`. |

Functions: `match_documents(query_embedding, match_count, match_threshold)` and
`replace_latest_chat_turn(...)` (regenerate: updates the newest turn in one statement).

Apply in this order, in the Supabase SQL editor or with `psql "$DATABASE_URL" -f <file>`; each file
is idempotent:

1. `supabase/schema.sql`
2. `supabase/migrations/20261016120000_visitor_scoped_sessions.sql` (visitor scoping, `updated_at`,
   cascade deletes)
3. `supabase/migrations/20261016140000_scheduling_state.sql` (scheduling state, turn metadata,
   `replace_latest_chat_turn`)

Without Supabase, development uses an in-memory store (lost on restart); production without
Supabase has no store, so chat answers single turns with no history and booking cannot progress.

## Security model

- Visitor identity: an anonymous `wizard_visitor` cookie, `uuid.HMAC-SHA256(VISITOR_COOKIE_SECRET)`,
  httpOnly, SameSite=Lax, Secure in production, 400 days. Every session and history query filters
  by the visitor id; another visitor's chat is a 404, never a 403.
- Supabase is reached only from the server with the service-role key; RLS is enabled with no
  policies, so the tables are closed to anon and publishable keys.
- Rate limits (`lib/rate-limit.ts`): chat 20 per visitor / 60 per IP per 5 minutes; booking
  attempts 3 per visitor / 5 per IP per 24 hours. Upstash Redis when configured; otherwise, or when
  Redis errors, per-instance in-memory windows.
- `/api/vapi/tools` requires `x-vapi-secret` equal to `VAPI_WEBHOOK_SECRET` (constant-time) and
  fails closed when the secret is unset. Voice bookings are not rate limited by the app.
- `/api/health` publicly returns only `{ ok }`, computed at most once a minute; details need
  `x-health-token` equal to `HEALTH_TOKEN` (at least 32 characters).
- Chat requires a JSON content type (CORS preflight), messages are capped at 2000 characters, and
  regenerate only works on the session's newest profile answer.

## Observability

`/api/chat` and `/api/chat/stream` write one JSON line per request with `console.info`
(`lib/logger.ts`) and return the same id in the `x-request-id` header:

```json
{ "requestId": "<x-vercel-id or uuid>", "route": "chat.stream", "status": 429,
  "intent": "profile", "via": "fast-path|llm|fallback|action", "retrieval": "vector|local-keyword",
  "timings": { "intake_ms": 0, "session_ms": 0, "routing_ms": 0, "retrieval_ms": 0,
               "calendar_ms": 0, "ttft_ms": 0, "total_ms": 0 },
  "outcome": "ok|stopped|rejected|error" }
```

Fields appear only when they apply (`status` only for rejected requests). The line never contains
message text, names or emails. Other routes log only failures (`console.error` / `console.warn`).
`/api/health` with the token checks the embedding dimensions, the `documents` count, the migrated
columns and `match_documents`.

## Environment variables

| Name | Required | Used by | Default | Notes |
| --- | --- | --- | --- | --- |
| `VISITOR_COOKIE_SECRET` | Production | `lib/visitor.ts` | Dev-only constant | At least 32 characters; chat and history return 503 in production without it. |
| `HEALTH_TOKEN` | No | `/api/health` | - | At least 32 characters; unlocks health details. |
| `OPENAI_API_KEY` | For vector search | `lib/llm/client.ts` | - | Without it, retrieval uses local keyword search over `data/`, and answers and routing use Groq when `GROQ_API_KEY` is set (otherwise heuristic routing and extractive answers). |
| `OPENAI_BASE_URL` | No | `lib/llm/client.ts` | OpenAI | For an OpenAI-compatible provider. |
| `OPENAI_CHAT_MODEL` | No | `lib/llm/client.ts` | `gpt-4.1-mini` | Grounded answers. |
| `OPENAI_ROUTER_MODEL` | No | `lib/chat/router.ts` | `gpt-4.1-nano` | Intent classifier. |
| `OPENAI_EMBEDDING_MODEL` | No | `lib/llm/client.ts`, `ingest:resume` | `text-embedding-3-small` | Must match the indexed embeddings. |
| `OPENAI_EMBEDDING_DIMENSIONS` | No | `lib/llm/client.ts` | 1536 (3072 for `text-embedding-3-large` / `gemini-embedding-001`) | Must match `vector(...)` in the schema. |
| `GROQ_API_KEY` | No | `lib/llm/client.ts`, `lib/llm/fallback.ts` | - | Groq answers and routes when OpenAI is unconfigured or a request fails before any text streams. No embeddings, so retrieval falls back to local search. |
| `GROQ_CHAT_MODEL` | No | `lib/llm/client.ts` | `openai/gpt-oss-120b` | Fallback answers; gpt-oss models run with low reasoning effort. |
| `GROQ_ROUTER_MODEL` | No | `lib/chat/router.ts` | `openai/gpt-oss-20b` | Fallback intent classifier; must support strict structured outputs. |
| `SUPABASE_URL` | For persistence and vector search | `lib/supabase.ts` | - | |
| `SUPABASE_SERVICE_ROLE_KEY` | With `SUPABASE_URL` | `lib/supabase.ts` | - | Secret key only; a publishable key is rejected. |
| `UPSTASH_REDIS_REST_URL` | Recommended in production | `lib/rate-limit.ts` | - | Or `KV_REST_API_URL` (Vercel Marketplace). |
| `UPSTASH_REDIS_REST_TOKEN` | With the URL | `lib/rate-limit.ts` | - | Or `KV_REST_API_TOKEN`. |
| `CAL_API_KEY` | For booking | `lib/calendar/` | - | Booking replies "not connected" without it. |
| `CAL_EVENT_TYPE_ID` | For booking | `lib/calendar/config.ts` | - | Numeric id of the 15-minute event type. |
| `CAL_HOST_EMAILS` | No | `lib/calendar/contacts.ts` | Shubham's two Gmail addresses | Comma-separated; `CAL_HOST_EMAIL` (single) is also read. |
| `CAL_API_VERSION` | No | `lib/calendar/client.ts` | `2026-02-25` | Bookings API version header. |
| `CAL_SLOTS_API_VERSION` | No | `lib/calendar/client.ts` | `2024-09-04` | Slots API version header. |
| `CAL_API_BASE_URL` | No | `lib/calendar/client.ts` | `https://api.cal.com/v2` | Testing against a mock Cal.com only. |
| `VAPI_WEBHOOK_SECRET` | For voice | `/api/vapi/tools`, `vapi:configure` | - | Sent by Vapi as `x-vapi-secret`. |
| `NEXT_PUBLIC_VAPI_PUBLIC_KEY` | For browser voice | `hooks/use-voice-call.ts` | - | Public; inlined at build time. |
| `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | For browser voice | `hooks/use-voice-call.ts`, `vapi:configure` | - | Public; inlined at build time. |
| `VAPI_API_KEY` | `vapi:configure` | `scripts/configure-vapi-assistant.ts` | - | Private Vapi key. |
| `VAPI_ASSISTANT_ID` | No | `scripts/configure-vapi-assistant.ts` | `NEXT_PUBLIC_VAPI_ASSISTANT_ID` | |
| `VAPI_TOOLS_URL` | `vapi:configure` | `scripts/configure-vapi-assistant.ts` | - | Public URL of `/api/vapi/tools`. |
| `VAPI_MODEL` | No | `scripts/configure-vapi-assistant.ts` | `gpt-5-nano` | Voice assistant model. |
| `NEXT_PUBLIC_SITE_URL` | No | `app/layout.tsx` | `https://$VERCEL_PROJECT_PRODUCTION_URL`, then `https://shubham-doppelganger.vercel.app` | Canonical URL for metadata and social cards. |
| `VERCEL_PROJECT_PRODUCTION_URL` | No | `app/layout.tsx` | - | Set by Vercel. |
| `GITHUB_OWNER` | No | `ingest:github` | `Shubhamm-02` | |
| `GITHUB_TOKEN` | No | `ingest:github` | - | Raises the GitHub API rate limit. |
| `NODE_ENV` | - | visitor, store, rate limit | Set by Next.js | `production` enforces the cookie secret and disables the in-memory store. |
