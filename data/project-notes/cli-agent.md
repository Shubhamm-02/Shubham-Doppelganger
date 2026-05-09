# CLI-Agent

## Source

- GitHub: https://github.com/Shubhamm-02/CLI-Agent
- Repo name: `CLI-Agent`
- Assignment context: Assignment 02 - AI Agent CLI Tool
- Primary language: JavaScript

## One-Line Summary

CLI-Agent is a conversational terminal-based AI agent that turns natural-language prompts into a Scaler Academy-inspired landing page using plain HTML, CSS, and JavaScript.

## Purpose

The project demonstrates how an AI agent can run a visible multi-step workflow from a terminal prompt and produce real browser-ready website files.

It was intentionally kept small so the full agent loop is easy to explain in a short 2 to 3 minute demo.

## What It Builds

When the user gives a request such as "Clone the Scaler Academy website with header, hero section, and footer", the CLI agent generates:

- `output/index.html`
- `output/style.css`
- `output/script.js`

The generated page includes:

- Sticky Scaler-style header.
- Hero section.
- Responsive cards.
- Footer.
- Mobile menu behavior.
- Dropdown interactions.
- Callback form interaction.

## Tech Stack

- Runtime: Node.js 18 or newer.
- Language: JavaScript.
- Interface: Conversational command-line interface.
- Frontend output: Plain HTML, CSS, and JavaScript.
- Optional AI provider: Gemini through `GOOGLE_API_KEY`.
- Offline mode: Built-in offline planner for demos without an API key.
- Dependencies: No npm dependencies are required.

## Architecture

The project separates terminal input from the agent logic and file-writing tools.

```text
Terminal input
  -> src/cli.js
  -> src/agent.js
  -> Gemini or offline planner
  -> safe file tools
  -> output/index.html
  -> output/style.css
  -> output/script.js
```

## Agent Loop

The CLI prints a visible multi-step loop in the terminal:

1. Understand request.
2. Plan page structure.
3. Generate HTML.
4. Generate CSS.
5. Generate JavaScript.
6. Review output.

This makes the project useful for a demo because the evaluator can see the agent reasoning stages instead of only seeing the final files.

## Core Features

- Runs as an interactive CLI chat tool.
- Accepts natural-language instructions.
- Detects Scaler website clone requests.
- Runs multiple visible agent steps.
- Writes browser-ready output files.
- Works online with Gemini when `GOOGLE_API_KEY` is configured.
- Works offline for demos when no API key is available.
- Restricts file tools to the configured `output/` directory.

## Setup and Run Commands

Requirements:

- Node.js 18 or newer.

Interactive chat:

```bash
npm start
```

One-shot generation:

```bash
npm run generate
```

Offline demo mode:

```bash
npm run demo
```

Optional Gemini setup:

```bash
cp .env.example .env
```

Then set:

```bash
GOOGLE_API_KEY=your_google_gemini_api_key_here
```

## Demo Flow

For a short demo, show this sequence:

1. Run `npm start`.
2. Enter a prompt like: "Clone the Scaler Academy website with header, hero section, and footer".
3. Show the multi-step agent loop in the terminal.
4. Show the generated `output/index.html`, `output/style.css`, and `output/script.js`.
5. Open `output/index.html` in a browser.
6. Point out the sticky header, hero section, footer, responsive layout, and small JavaScript interactions.

## Design Choices and Tradeoffs

- The project uses plain HTML, CSS, and JavaScript instead of a frontend framework so the generated output is easy to inspect and open directly in a browser.
- The agent loop is intentionally explicit and printed in the terminal, which makes the behavior easier to explain during an interview or demo.
- The project supports both Gemini-powered planning and an offline planner, which makes demos more reliable when API keys or internet access are unavailable.
- File-writing is restricted to the output directory to reduce risk from generated code.
- The project is intentionally small, so it is better at demonstrating the agent workflow than at generating complex production websites.

## Known Limitations

- The generated page is Scaler-inspired, not a full production clone.
- It focuses on a specific webpage-generation use case rather than being a general-purpose coding agent.
- Offline mode is useful for demos but may be less flexible than Gemini-backed planning.
- The project has no npm dependencies, which keeps setup simple but limits advanced parsing, testing, and UI-generation capabilities.
- There are no releases or packages published for the repo.

## Good Interview Talking Points

- The project shows agentic decomposition: understand, plan, generate, and review.
- The CLI and agent logic are separated, which keeps input handling independent from the generation workflow.
- The output files are real artifacts, not just text shown in the terminal.
- The offline mode improves demo reliability.
- The safe file tools show awareness of controlling where generated code is written.
- The project is deliberately scoped for explainability, which is useful in a screening assignment.

## Questions This Note Can Answer

- What is CLI-Agent?
- What problem does CLI-Agent solve?
- What tech stack does CLI-Agent use?
- How does the agent loop work?
- What files does it generate?
- How can someone run the project?
- Why does it support offline mode?
- What are the tradeoffs of using plain HTML, CSS, and JavaScript?
- What makes it easy to demo?
- What are the limitations of the project?

## Extra Details To Add Later

These details would make the AI persona's answers stronger if available:

- Which files Shubham personally spent the most time designing.
- Any specific bug or challenge faced while building the safe file tools.
- Why Gemini was chosen over other model providers.
- Whether the project was completed individually or as part of a course submission.
- Any before-and-after improvement from the first version to the final version.
- A short note on what Shubham would improve in version 2.

