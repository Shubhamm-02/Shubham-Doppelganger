# Comment AI

## Source

- Project name: Comment AI / CommentAI
- GitHub: https://github.com/Shubhamm-02/CommentAI
- Demo video: https://drive.google.com/drive/folders/1wv0e5_wMb_dQxdJdRs8zRPv5OMR9e1oC
- Primary backend language: Python
- Dashboard stack: FastAPI and React
- Local LLM runtime: Ollama
- Model: `llama3:8b`
- Supported platforms: Instagram and LinkedIn

## One-Line Summary

CommentAI is a local AI agent that generates and posts comments on Instagram and LinkedIn using Llama 3 through Ollama, with a FastAPI and React dashboard for monitoring activity.

## Why This Project Matters

This project is important because it shows practical agent engineering beyond a simple chatbot:

- Local LLM usage with no paid API dependency.
- Browser or platform automation workflow.
- Safety limits around repeated engagement.
- Anti-spam controls.
- Dashboard monitoring.
- Backend and frontend integration.
- Long-running local process management.

It also shows that Shubham can design an AI system with guardrails, observability, and operational controls instead of only focusing on generation quality.

## Purpose

The goal of CommentAI is to help users grow their social presence by automatically engaging with relevant Instagram and LinkedIn posts from their own local machine.

The project is designed to run without external LLM API keys by using an open-source Llama 3 model locally through Ollama.

## What It Does

- Runs a local AI commenting agent.
- Uses `llama3:8b` through Ollama for comment generation.
- Works without paid LLM API keys.
- Supports Instagram and LinkedIn engagement workflows.
- Provides a local web dashboard.
- Shows total engagement.
- Shows daily limits.
- Shows a live activity log.
- Applies anti-spam guardrails before commenting.

## Tech Stack

- Python 3.10 or newer.
- FastAPI for the local backend and dashboard API.
- React for the dashboard frontend.
- Node.js 18 or newer for frontend tooling.
- Ollama for running the local model.
- Llama 3 8B as the local language model.
- PM2 for keeping the agent and dashboard running in the background.
- Environment variables in `.env` for credentials and safety settings.

## Core Features

### Local LLM Engine

CommentAI uses `llama3:8b` locally through Ollama.

This means:

- No OpenAI, Gemini, or Anthropic API key is required.
- There are no per-token API costs.
- The system can run locally after setup.
- The user keeps model execution on their own machine.

### Anti-Spam Guardrails

The project includes several safety controls:

- It does not comment on the same post twice.
- It enforces a 3-day cooldown per creator or author.
- It prevents semantic repetition so the agent does not generate the same style of comment repeatedly.
- It simulates realistic human delays between engagements.
- It supports configurable safe daily limits.

Recommended configuration:

- 15 to 20 maximum comments per day.
- 300 to 1800 second delays between engagements.

### Real-Time Dashboard

The local FastAPI and React dashboard helps monitor the agent while it runs.

The dashboard shows:

- Total engagement.
- Daily usage limits.
- Live activity log.
- Current agent status.

## Architecture

```text
Local machine
  -> PM2 starts backend and dashboard
  -> FastAPI backend controls agent workflow
  -> Ollama runs llama3:8b locally
  -> agent generates candidate comments
  -> anti-spam guardrails validate engagement
  -> Instagram/LinkedIn workflow posts approved comments
  -> React dashboard displays live activity
```

## Setup

Prerequisites:

- Python 3.10 or newer.
- Node.js 18 or newer.
- Ollama installed locally.

Pull the local model:

```bash
ollama pull llama3:8b
```

Install Python dependencies:

```bash
pip install -r requirements.txt
```

Install and build the dashboard:

```bash
cd "Frontend"
npm install
npm run build
cd ..
```

Create a local environment file:

```bash
cp .env.example .env
```

Then configure:

- Instagram credentials.
- LinkedIn credentials.
- Daily engagement limits.
- Delay range between engagements.

Credentials should stay local and must not be committed to GitHub.

## Run

Install PM2 globally:

```bash
npm install -g pm2
```

Start the agent and dashboard:

```bash
npx pm2 start ecosystem.config.js
```

Open the local dashboard:

```text
http://localhost:8000
```

## Design Choices and Tradeoffs

- Ollama and Llama 3 were used to avoid paid API keys and make the agent free to run locally.
- A local-first design gives the user more control over credentials, model execution, and runtime behavior.
- FastAPI was used for the backend because it is lightweight and works well for Python agent services.
- React was used for the dashboard to provide a clearer live monitoring experience than terminal logs alone.
- PM2 was used to keep the backend and dashboard running in the background.
- Anti-spam rules were added because an automated commenting agent needs guardrails before it can be considered responsible.
- Local LLM inference can be slower than hosted APIs depending on the user's hardware.
- Platform automation must be used carefully and should respect Instagram and LinkedIn rules, rate limits, and acceptable-use expectations.

## Known Limitations

- The project depends on the user's local machine performance for Llama 3 inference.
- Local model quality may vary compared with larger hosted models.
- Instagram and LinkedIn automation can be fragile if platform UI or access rules change.
- The project requires users to manage credentials securely in `.env`.
- It is intended for careful, limited engagement, not high-volume spam.
- The dashboard runs locally and is not a hosted SaaS product.

## Good Interview Talking Points

- The project shows local AI agent development using Ollama and Llama 3.
- It demonstrates a full system, not only a prompt: backend, dashboard, model runtime, process management, and guardrails.
- The anti-spam controls show responsible product thinking around automated social engagement.
- The dashboard adds observability, which makes the agent easier to monitor and debug.
- The project avoids API costs, which makes it accessible for local demos and personal use.
- The daily limits, creator cooldown, duplicate-post prevention, and semantic repetition checks are practical safety features.

## Responsible Use Notes

CommentAI should be described as a guarded local engagement assistant, not as a spam bot.

When discussing this project, the persona should emphasize:

- Low-volume usage.
- User-controlled configuration.
- Anti-spam guardrails.
- Respect for platform policies.
- Credential privacy.
- Monitoring through the local dashboard.

The persona should not claim that the tool bypasses platform restrictions, evades detection, or guarantees follower growth.

## Questions This Note Can Answer

- What is CommentAI?
- Why did Shubham build CommentAI?
- What tech stack does CommentAI use?
- How does it run without API keys?
- What role does Ollama play?
- What role does Llama 3 play?
- What does the FastAPI and React dashboard show?
- What anti-spam guardrails are included?
- How does PM2 help run the project?
- What are the limitations of local LLM inference?
- How does the project handle responsible automation?

## Extra Details To Add Later

These details would make the AI persona's answers stronger if available:

- The GitHub repository URL.
- The Google Drive demo video URL.
- Whether the Instagram and LinkedIn workflows use browser automation, official APIs, or another approach.
- How semantic repetition is detected.
- What data is stored locally for cooldowns and duplicate prevention.
- One challenge faced while integrating Ollama with the agent.
- One dashboard feature Shubham personally spent the most effort designing.
- What Shubham would improve in version 2.
