# Architecture

```text
Interviewer
  -> Web chat on Next.js
  -> Phone call through Vapi
  -> Shared Next.js API backend
       -> RAG service
       -> Supabase pgvector
       -> Cal.com booking
       -> Eval logging
  -> Resume and project notes as source-of-truth data
```

## Day 1 State

- Resume markdown is available at `data/resume.md`.
- Project notes are available in `data/project-notes/`.
- Next.js app scaffold is present.
- Local chunk search is available as a fallback retrieval layer.
- Supabase schema is drafted in `supabase/schema.sql`.

## Day 2 State

- Resume and project notes are chunked by Markdown sections.
- Embedding generation is implemented through OpenAI.
- Supabase document upsert is implemented.
- Supabase vector retrieval is implemented through `match_documents`.
- Chat answers use Supabase vector RAG when keys are configured.
- Chat falls back to local chunk search when keys are missing.
- Conversation logging is implemented for Supabase-backed chat.

## Current Voice + Calendar State

- Vapi uses the same deployed `/api/vapi/tools` endpoint as the chat backend.
- Voice profile questions call `search_profile` before answering.
- Scheduling is India-only and assumes `Asia/Kolkata`.
- Calendar availability comes from Cal.com slots.
- Calendar booking uses a fixed 15-minute Cal.com event type.
- Shubham's own email addresses are blocked as attendee emails to avoid self-booking.
- Chat and voice share the same calendar implementation, with voice adding explicit email confirmation.
