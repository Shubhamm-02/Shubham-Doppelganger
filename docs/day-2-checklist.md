# Day 2 Checklist

## Completed In Code

- Added Markdown chunking for `data/resume.md` and `data/project-notes/*.md`.
- Added chunk metadata:
  - source type
  - source name
  - source path
  - section title
  - chunk index
  - content hash
- Added OpenAI embedding helper with `OPENAI_EMBEDDING_MODEL`.
- Added Supabase admin client helper.
- Added document upsert logic.
- Added Supabase vector match helper.
- Added grounded answer generation over retrieved chunks.
- Added conversation logging helper.
- Updated `/api/chat` to use Supabase vector RAG when configured.
- Kept local chunk fallback when OpenAI or Supabase keys are missing.
- Updated `supabase/schema.sql` with:
  - `source_path`
  - `content_hash`
  - `embedding_model`
  - unique source/chunk index
  - vector index
  - `match_documents` RPC
- Verified dry-run ingestion.
- Verified eval script.
- Verified production build.

## Manual Supabase Steps

1. Open Supabase dashboard.
2. Create or open the project for this app.
3. Open SQL editor.
4. Run `supabase/schema.sql`.
   - If Supabase warns that new tables do not have Row Level Security, choose **Run and enable RLS**.
   - The app uses the service-role key only from server-side code, so RLS should stay enabled and no browser client should directly access these tables.
5. Create `.env.local` from `.env.example`.
6. Add:
   - `OPENAI_API_KEY`
   - `OPENAI_BASE_URL=` unless you are intentionally using an OpenAI-compatible provider
   - `OPENAI_MODEL=gpt-4.1-mini`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_EMBEDDING_MODEL=text-embedding-3-small`
   - `OPENAI_EMBEDDING_DIMENSIONS=1536`
7. Run:

```bash
npm run ingest:resume
```

Expected result:

- 87 chunks embedded and upserted into Supabase.

## Validation After Ingestion

Run:

```bash
npm run evals
npm run build
```

Then start the app:

```bash
npm run dev
```

Ask:

- How does the PDF Grounded Chatbot avoid hallucinations?
- What anti-spam guardrails are in CommentAI?
- What role does FAISS play in the CCPA project?
- Did Shubham win the IISc hackathon?

Expected behavior:

- The API should use `retrievalMode: "supabase-vector"`.
- Answers should be generated from retrieved chunks.
- Citations should point to source Markdown files.
- Conversations should be logged in the `conversations` table.
- `/api/health` should return `"ok": true`.

## Production Troubleshooting

- If `/api/health` says `API key not valid` and `baseURL` points to `generativelanguage.googleapis.com`, the app is sending an OpenAI key to Gemini. Clear `OPENAI_BASE_URL` and use OpenAI models, or replace the key with a valid Gemini key and update the vector dimension/schema for Gemini.
- If `/api/health` says `Could not find the function public.match_documents` or a table is missing, run `supabase/schema.sql` in the Supabase SQL editor, then rerun `npm run ingest:resume`.
- If `/api/health` says the documents table is empty, the schema exists but profile chunks have not been ingested yet.

## Notes

- `resume.md` is the ingestion source because it is cleaner to chunk than PDF.
- Keep the real resume PDF only as a human-readable artifact.
- Do not put real API keys in `.env.example`.
- If the HNSW vector index fails in Supabase, run the schema without that index first; retrieval will still work for this small dataset.
