# Shubham Shah AI Representative

RAG-grounded voice and chat persona for answering questions about Shubham Shah's resume, GitHub projects, and interview availability.

## Current Status

Day 3 scaffold is in progress:

- Resume markdown and project notes are in `data/`.
- Next.js app structure is created.
- Chat UI, persistence, sessions, and copy/delete actions are implemented.
- Markdown chunking is implemented.
- OpenAI embedding ingestion is implemented.
- Supabase document upsert and vector retrieval are implemented.
- Local chunk search remains as a fallback when env keys are missing.
- Vapi web calls are wired. Assistant tool configuration is handled by `npm run vapi:configure`.
- Cal.com availability and booking are wired through `/api/calendar/*` and Vapi tools.

The app is not production-ready yet. The next manual step is to run the Supabase schema, add real keys to `.env.local`, and run ingestion.

## Setup

Install dependencies:

```bash
npm install
```

Create local env:

```bash
cp .env.example .env.local
```

Run the dev server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

## Data Sources

- `data/resume.md`
- `data/project-notes/*.md`

`data/resume.md` is the ingestion source. A matching PDF can be kept for humans, but the RAG pipeline does not need it.

## Useful Commands

```bash
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

## Day 1 Checklist

See `docs/day-1-checklist.md`.

## Day 2 Checklist

See `docs/day-2-checklist.md`.
