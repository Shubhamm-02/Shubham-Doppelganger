# growth-assistant

- GitHub: https://github.com/Shubhamm-02/growth-assistant
- Created: 2026-08-26
- Last pushed: 2026-08-26
- Languages: Python, JavaScript, CSS, Makefile, Dockerfile, Shell, HTML
- Topics: None
- Description: Grounded AI assistant over Lenny's Podcast transcripts — RAG with citations, a Ship 30 essay skill, and a sandboxed artifact viewer. FastAPI + Postgres/pgvector + React, running fully local & free on Ollama (Anthropic/OpenAI optional).

## README

# The Lenny Growth Assistant

A full-stack, AI-powered conversational assistant that answers **product & growth**
questions grounded in **Lenny's Podcast** transcripts, writes **Ship 30 for 30**
essays, and generates **Markdown/HTML artifacts** rendered in a sandboxed in-app viewer.

Runs **100% local and free** by default (Ollama + Postgres). Cloud models
(Anthropic / OpenAI) are **optional** toggles.

- **Backend:** FastAPI + SQLAlchemy (async) + PostgreSQL/pgvector
- **Agent:** provider-abstracted router + skills (Q&A, Ship 30, Artifact)
- **Frontend:** React + Vite + Tailwind, with a Claude-style Artifact Viewer
- **Deploy:** Docker Compose, structured logs, health/readiness, tests

> 📚 Full docs: `docs/PRD.md` · `docs/architecture.md` · `docs/design.md`

---

## Architecture at a glance

```
React/nginx  ──/api──▶  FastAPI  ──▶  Agent (router → skill)
                           │              ├── Retriever ──▶ Postgres + pgvector
                           │              └── Providers ──▶ Ollama (host) / Anthropic / OpenAI
```

See `docs/architecture.md` for the schema, endpoints, and security model.

---

## Prerequisites
- **Docker + Docker Compose** (Docker Desktop on macOS/Windows).
- **[Ollama](https://ollama.com)** installed and running on your host machine
  (required for the local demo).
- **Git** (to clone the transcripts).
- ~6 GB free disk for the Ollama models.

---

## ⚠️ Heavy commands — run these yourself

These consume significant time/bandwidth/compute, so run them manually:

```bash
# 0) One-time: create your env file
make setup                       # copies .env.example -> .env

# 1) Pull local models (a few GB) — REQUIRED for the demo
ollama pull llama3.1:8b
ollama pull nomic-embed-text
#   (or: make models)

# 2) Clone Lenny's transcripts into data/transcripts  (large repo)
make transcripts
#   (or: bash scripts/fetch_transcripts.sh)

# 3) Build & start the whole stack
docker compose up --build
#   (or: make up)

# 4) Ingest transcripts into the vector store (embeds every chunk — slow first run)
#    Run in a second terminal once the stack is healthy:
docker compose exec backend python -m app.rag.ingest
#    Fast sanity check on just 20 files:
docker compose exec backend python -m app.rag.ingest --limit 20
#   (or: make ingest / make ingest-smoke)
```

Then open **http://localhost:8080**.

> Tip: start with `make ingest-smoke` (20 files) to verify end-to-end quickly before
> the full ingest.

---

## API keys — what to put in `.env`

| Variable | Required? | Where to get it | Notes |
|---|---|---|---|
| *(none)* | — | — | **Default stack needs NO API keys.** Ollama is local & free. |
| `ANTHROPIC_API_KEY` | Optional | https://console.anthropic.com | Enables the Anthropic toggle. Starts with `sk-ant-`. |
| `OPENAI_API_KEY` | Optional | https://platform.openai.com/api-keys | Enables the OpenAI toggle + OpenAI embeddings. Starts with `sk-`. |

Postgres credentials default to `lenny/lenny` (local Docker) — no action needed.
To switch the active model, set `LLM_PROVIDER=ollama|anthropic|openai` (or use the
in-app dropdown per request). Full variable reference: `.env.example`.

> **If you add a cloud provider**, set `LLM_PROVIDER` and, if you also want cloud
> embeddings, `EMBEDDING_PROVIDER=openai` + `EMBEDDING_DIM=1536` — then **re-ingest**
> (embedding dimensions must match the stored vectors).

---

## Running without Docker (local dev)

**Backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
# Point DATABASE_URL at a local Postgres w/ pgvector, and OLLAMA_BASE_URL at localhost
export DATABASE_URL=postgresql+asyncpg://lenny:lenny@localhost:5432/lenny
uvicorn app.main:app --reload --port 8000
python -m app.rag.ingest --limit 20    # after transcripts are cloned
```

**Frontend**

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173 (proxies /api -> http://localhost:8000)
```

---

## Tests

```bash
make test                        # backend unit tests, fully offline
# or:
cd backend && python -m pytest -q -m "not integration"
```

Covered: chunking, skill routing, orchestrator grounding/refusal/artifact parsing,
HTML sanitization, and API contracts (health, validation envelope, OpenAPI).

**Manual UI test plan:** see `docs/manual-test-plan.md`.

---

## Using the app
- **New chat** (sidebar) — each session keeps independent context.
- Ask a **growth/PM question** → grounded answer with source chips.
- Ask to **"write a Ship 30 essay on retention"** → ~1,250-word essay artifact.
- Ask to **"make an HTML one-pager…"** → sandboxed HTML rendered in the viewer.
- Switch the **model** (top-right) — unavailable providers are shown disabled.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Chat returns `provider_unavailable` (503) | Ollama not running / model not pulled | `ollama serve`; `ollama pull llama3.1:8b`; check `GET /config`. |
| Backend can't reach Ollama in Docker | Wrong base URL | Ensure `OLLAMA_BASE_URL=http://host.docker.internal:11434` (default in compose). |
| Answers say "couldn't find that…" | Transcripts not ingested | Run `make transcripts` then `make ingest`. |
| Ingest error: transcripts dir not found | Repo not cloned | `make transcripts`. |
| `dimension mismatch` on ingest/query | Embedding dim ≠ stored vectors | Match `EMBEDDING_DIM` to the model, then `python -m app.rag.ingest --reset`. |
| `/ready` = degraded | DB or provider down | Check the `checks` object it returns; see container logs. |
| Frontend loads but API calls fail | Backend not up / CORS | Confirm `docker compose ps`; in dev, backend must be on :8000. |

Logs are structured JSON — filter by request id:
`docker compose logs backend | grep <X-Request-ID>`.

---

## Project layout

```
backend/    FastAPI app (core, providers, rag, agent, skills, routers) + tests
frontend/   React + Vite SPA (chat, sidebar, provider toggle, artifact viewer)
docs/       PRD, architecture, design, manual test plan
scripts/    fetch_transcripts.sh
agent-transcripts/  coding-agent build logs (incl. corrections)
docker-compose.yml, Makefile, .env.example
```

## License / data
Transcripts belong to their respective owners (Lenny's Podcast / the transcript repo)
and are **not** committed here — they are cloned locally at setup.
