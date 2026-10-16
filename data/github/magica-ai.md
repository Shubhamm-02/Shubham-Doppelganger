# Magica-AI

- GitHub: https://github.com/Shubhamm-02/Magica-AI
- Created: 2026-06-17
- Last pushed: 2026-08-13
- Languages: TypeScript, JavaScript, CSS
- Topics: None
- Description: None

## README

# Magica AI Workflow Clone

Pixel-focused workflow builder clone built.

## Stack

- Next.js App Router + TypeScript
- React Flow canvas
- Zustand graph state
- Prisma + Neon Postgres
- Clerk auth
- Trigger.dev execution
- Gemini API integration with demo fallback on quota errors
- Transloadit upload integration
- FFmpeg/sharp image cropping
- Tailwind CSS

## Features

- Protected sign-in/sign-up flow
- Workflow dashboard with create/open/delete actions
- React Flow canvas with fixed default workflow layout
- Request-Inputs and Response nodes protected from deletion
- Crop Image and Gemini 3.1 Pro nodes
- Type-safe DAG connections and cycle prevention
- Event-style scheduler: ready nodes start immediately, and children unlock as soon as their own dependencies finish
- 30+ second Crop Image Trigger.dev delay
- Single-node and full workflow runs
- Execution history with per-node status, start offset, duration, inputs, outputs, and errors
- Undo/redo, minimap, import/export, upload previews, and crop previews

## Trigger.dev 30-second delay

The Crop Image node runs as a Trigger.dev task (`nextflow.cropImage`) that includes a deliberate
`wait.for(30 seconds)` before uploading its output, satisfying the 30+ second delay requirement.
The run trace below shows the wait inside `run()`:

## Local Setup

```bash
npm install
cp .env.example .env.local
npm run prisma:generate
npm run dev
```

Run the Trigger.dev worker in a second terminal:

```bash
npx trigger.dev@latest dev
```

## Required Env Vars

See `.env.example` for the full list:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `DATABASE_URL`
- `TRIGGER_SECRET_KEY`
- `TRIGGER_PROJECT_ID`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `TRANSLOADIT_AUTH_KEY`
- `TRANSLOADIT_AUTH_SECRET`
- `NEXT_PUBLIC_CANDIDATE_LINKEDIN`

## Verification

```bash
npm run typecheck
npm run build
```
