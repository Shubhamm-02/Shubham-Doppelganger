# Shubham Shah AI Representative

RAG-grounded voice and chat persona for answering questions about Shubham Shah's resume, GitHub projects, and interview availability.

## Live Demo

The deployed chat is available at:

```text
https://shubham-doppelganger.vercel.app/
```

Use `docs/demo-checklist.md` for the recommended walkthrough.

## What It Does

- Answers questions from Shubham's resume and project notes using RAG.
- Supports persistent web chat with sessions, copy actions, and a Poe/ChatGPT-inspired UI.
- Supports Vapi voice calls through the same profile-search and scheduling tools.
- Checks real Cal.com availability and books fixed 15-minute interviews.
- Assumes India time for scheduling and blocks Shubham's own email as the attendee email.

## Data Sources

- `data/resume.md`
- `data/project-notes/*.md`

`data/resume.md` is the ingestion source. A matching PDF can be kept for humans, but the RAG pipeline does not need it.

## Developer Notes

Useful local commands:

```bash
npm install
npm run dev
npm run ingest:resume
npm run ingest:github
npm run vapi:configure
npm run evals
npm run build
```

## Vapi Assistant Tools

Set these in `.env.local`:

```bash
VAPI_API_KEY=
VAPI_ASSISTANT_ID=
VAPI_TOOLS_URL=https://your-public-domain.com/api/vapi/tools
NEXT_PUBLIC_VAPI_PUBLIC_KEY=
NEXT_PUBLIC_VAPI_ASSISTANT_ID=
```

`VAPI_TOOLS_URL` must be public. Vapi cannot call `localhost` unless you expose it with a tunnel or deploy the app.

Then run:

```bash
npm run vapi:configure
```

## Architecture

See `docs/architecture.md`.

## Demo Checklist

See `docs/demo-checklist.md`.

## Day 1 Checklist

See `docs/day-1-checklist.md`.

## Day 2 Checklist

See `docs/day-2-checklist.md`.
