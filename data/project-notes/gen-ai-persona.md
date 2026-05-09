#this is Assigment 1 of my GenAI course at scaler school of technology

# ScalerMind -- Persona-Based AI Chatbot

A chatbot that lets you have conversations with AI personas of three Scaler/InterviewBit personalities: **Anshuman Singh**, **Abhimanyu Saxena**, and **Kshitij Mishra**.

Built as part of the Prompt Engineering assignment at Scaler Academy.

## Live Demo

Deployed Link - gen-ai-persona-kappa.vercel.app

## Features

- Three distinct AI personas with researched system prompts
- Persona switcher with conversation reset
- Suggestion chips for quick-start questions
- Typing indicator during API calls
- Graceful error handling
- Mobile-responsive design
- Dark greyish-black theme

## Tech Stack

- **Frontend:** Next.js 15 (App Router), React, Vanilla CSS
- **Backend:** Next.js API Routes
- **LLM:** Google Gemini 2.0 Flash via `@google/generative-ai`
- **Deployment:** Vercel

## Setup

### Prerequisites

- Node.js 18+
- A Google Gemini API key ([get one here](https://aistudio.google.com/app/apikey))

### Steps

1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd chatbot-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env.local` file from the template:
   ```bash
   cp .env.example .env.local
   ```

4. Add your API key to `.env.local`:
   ```
   GOOGLE_API_KEY=your_actual_api_key
   ```

5. Start the development server:
   ```bash
   npm run dev
   ```

6. Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
chatbot-app/
  app/
    api/chat/route.js   -- API endpoint for Gemini chat
    globals.css          -- Styles (greyish-black theme)
    layout.js            -- Root layout with metadata
    page.js              -- Main chat interface
  lib/
    prompts.js           -- Three persona system prompts
  prompts.md             -- Annotated system prompts
  reflection.md          -- Project reflection (300-500 words)
  .env.example           -- Environment variable template
```

## Deployment

Deploy to Vercel:

1. Push the repository to GitHub
2. Import the project on [vercel.com](https://vercel.com)
3. Add `GOOGLE_API_KEY` as an environment variable in Vercel project settings
4. Deploy

## Notes

- API keys are never committed to source code. Use `.env.local` for local development.
- Switching personas resets the conversation.
- Responses are AI-generated and do not represent the actual views of the real individuals.