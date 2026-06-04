# Day 1 Checklist

## Completed

- Created source-of-truth data folder.
- Added resume markdown at `data/resume.md`.
- Added project notes for:
  - CLI-Agent.
  - PDF-Grounded Chatbot.
  - CommentAI.
  - CCPA Compliance Reasoning System.
- Normalized project-note metadata and GitHub links.
- Added Next.js app scaffold.
- Added placeholder chat UI.
- Added local profile-source search.
- Added placeholder API routes for chat, Vapi tools, availability, and booking.
- Added Supabase schema draft.
- Added environment variable template.

## Needs Manual Action

- Replace the empty `data/resume.pdf` with the real resume PDF.
- Create the Supabase project from the dashboard.
- Run `supabase/schema.sql` in the Supabase SQL editor.
- Create `.env.local` from `.env.example`.
- Add real API keys only to `.env.local` or deployment settings.

## Next Day 2 Work

- Chunk `resume.md` and project notes.
- Generate embeddings.
- Insert chunks into Supabase.
- Replace local lexical search with vector retrieval.
- Add retrieval logging for evals.
