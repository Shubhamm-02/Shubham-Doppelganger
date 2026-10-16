# revenue-recovery-agent

- GitHub: https://github.com/Shubhamm-02/revenue-recovery-agent
- Created: 2026-08-22
- Last pushed: 2026-09-02
- Languages: TypeScript, CSS, JavaScript
- Topics: None
- Description: AI agent that detects at-risk payments, diagnoses the cause, and recovers revenue on Razorpay test-mode - with stopping rules, escalation, and a full audit trail. Razorpay Buildathon Track 03.

## README

# AI Revenue Recovery Agent

> **Razorpay AI Buildathon — Track 03: AI Revenue Recovery**
> An agent that detects revenue slipping away, diagnoses *why*, chooses the right
> bounded intervention, and recovers the money — with stopping rules, compliant
> escalation, and a full audit trail.

Revenue loss rarely happens in one clean step: a payment degrades, a card
expires, a bank declines. This agent closes the loop from **detecting** the
problem → **diagnosing** the root cause → **choosing** an intervention →
**executing** a bounded recovery on Razorpay test-mode → **measuring** the money
recovered across a batch.

---

## The recovery loop

For each at-risk payment the agent runs:

```
detect → diagnose (LLM) → decide (LLM) → policy gate → execute → measure → audit
```

1. **Detect** — scan a batch of failed payments.
2. **Diagnose** — an LLM reads the messy raw gateway error and classifies the
   root cause (`gateway_timeout`, `insufficient_funds`, `expired_card`,
   `suspected_fraud`, …).
3. **Decide** — it proposes one bounded action: `retry_now`, `retry_later`,
   `send_payment_link`, `escalate_human`, or `abandon`.
4. **Policy gate** — hard, auditable rules have the final say: never retry
   fraud/stolen cards, stop after `MAX_RETRIES`, escalate on low confidence.
   *The LLM proposes; policy disposes.*
5. **Execute** — for a payment link it calls the **real Razorpay test-mode API**.
6. **Measure & audit** — every decision is logged with its reasoning, and the
   money recovered is tallied across the batch.

## What makes it more than a demo

- **Measured money recovered** across a batch, framed against a do-nothing
  baseline (cost is shown as a % of recovered, not an unbelievable ratio).
- **Honest AI metric** — diagnosis accuracy is graded against a *hidden
  ground-truth label* the model never sees (a held-out check).
- **Prevention insights** — after a run, one LLM call turns the batch into
  "here's how to stop the leak" (systemic patterns + prioritised fixes).
- **Compliant escalation & stopping rules** — nothing is ever silently dropped;
  fraud and max-retry cases route to a human queue with a reason.
- **Full, searchable audit trail** — every stage, timestamped, with the model's
  own words.
- **Resilient** — LLM calls retry with backoff; a persistent failure escalates
  that one payment instead of aborting the batch.
- **Cheap & fast** — analysis is cached by error signature, so a batch makes far
  fewer LLM calls and repeat runs are instant.

## Tech stack

- **Next.js (App Router) + TypeScript** — one app, UI + API routes together
- **Groq** (`gpt-oss-120b`) via the **Vercel AI SDK** — diagnosis & decisions
- **Razorpay** test-mode SDK — real payment-link creation
- **shadcn/ui + Tailwind** — the "Recovery Ledger" interface (Space Grotesk
  display, IBM Plex Mono figures)
- **JSON-file persistence** — no database to run

## Getting started

**Prerequisites:** Node.js 18+ and the free API keys below.

```bash
# 1. Install
npm install

# 2. Configure secrets
cp .env.example .env.local     # then fill in the keys (see the file)

# 3. Run
npm run dev                    # http://localhost:3000
```

Get the keys:
- **Groq** (free): https://console.groq.com → API Keys
- **Razorpay** (free): dashboard → toggle **Test Mode** → Settings → API Keys →
  Generate Test Key

## Using it

1. **Seed a batch** — generates ~30 realistic at-risk payments with messy,
   unlabeled gateway errors.
2. **Run recovery agent** — watch the money-recovered figure climb live, the
   audit trail stream, and the escalation queue fill.
3. Read the **root-cause chart**, **prevention insights**, and export the
   **audit trail**.

## Architecture

```
src/
├── app/
│   ├── page.tsx              # dashboard (orchestrator)
│   └── api/{seed,run,batch,audit}/  # seed, SSE run stream, state, export
├── hooks/                    # useRecoveryRun (SSE lifecycle), pagination, count-up
├── lib/
│   ├── agent.ts              # the detect→diagnose→decide→execute loop
│   ├── policy.ts             # bounded rules: stopping, escalation, confidence
│   ├── llm.ts                # Groq calls + analysis cache + prevention insights
│   ├── razorpay.ts           # real test-mode payment links (graceful fallback)
│   ├── store.ts              # JSON persistence + metrics
│   └── seed.ts               # synthetic batch generator (+ hidden ground truth)
└── components/               # Recovery Meter, tables, chart, audit trail
```

## Deployment

Runs on any **long-lived Node host** (e.g. Render / Railway / Fly free tiers)
with no changes — it writes JSON to `./data`. On a **read-only serverless
filesystem** it automatically falls back to the OS temp dir (set `DATA_DIR` to
override), so it never crashes on write; it simply starts empty and you seed a
batch to begin. Set the three env vars from `.env.example` in your host.

## Honest limitations

- Recovery **outcomes are simulated** in test mode (probability-weighted per
  action and failure type, deterministic by default for reproducible demos).
  The payment *links* are real; a real end-to-end confirmation would come from a
  Razorpay webhook — a natural next step.
- State is JSON files, sized for a demo batch, not production scale.
