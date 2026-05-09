# CivicPath Election Assistant

CivicPath is an interactive assistant that helps people understand election timelines, registration steps, voting methods, official sources, and post-election result stages. It is built as a small static web app so the repository stays lightweight and easy to evaluate.

## Chosen Vertical

**Civic education and voter readiness.** The assistant is designed for voters, first-time voters, people who moved recently, accessibility-focused voters, overseas or away-from-home voters, and educators helping others understand the election process.

## Approach and Logic

The app combines deterministic civic workflow logic with optional Google services:

- Builds a personalized election plan from country/region, election type, voter situation, registration status, voting method, location, and election day.
- Converts the user context into a readiness score, next best action, timeline, and checklist.
- Answers process questions with local rule-based intent detection for registration, documents, timelines, polling place, voting method, accessibility, misinformation, candidates, and results.
- Avoids inventing legal deadlines. The assistant repeatedly routes deadline-sensitive questions to official election sources.
- Stores only non-sensitive planning context by default. API keys are saved only when the user opts in.

## Architecture

```text
index.html                 App shell and semantic UI landmarks
server.js                  Cloud Run static server, import-safe and tested
src/electionData.js        Country profiles, personas, timeline data, intent keywords
src/electionAssistant.js   Pure planning, scoring, calendar/map URL, and Q&A logic
src/googleServices.js      Gemini and Google Civic Information API clients
src/main.js                Browser state, rendering, forms, and user interaction
src/styles.css             Responsive, accessible interface styling
tests/                     Node test suite for planner and server behavior
```

Core election reasoning is kept in pure functions so it can be tested without a browser. Static civic data is separated from behavior to keep future country/persona updates low-risk. The Cloud Run server is intentionally small and serves only files inside the project root.

## Efficiency Choices

- No runtime npm dependencies.
- Google API clients are lazy-loaded only when a Gemini or Civic API action is used.
- Static files are served with cache headers for stable repeat loads.
- `.gcloudignore` keeps tests, docs, git metadata, and local-only files out of Cloud Run source uploads.
- Performance-budget tests guard against accidental payload growth.

## Google Services Used

- **Google Gemini API:** Optional AI explanation layer using `gemini-2.5-flash`. The local deterministic answer and voter context are supplied to Gemini so the model stays grounded in the app logic.
- **Google Civic Information API:** Optional US voter information lookup for available elections, polling locations, early vote sites, contests, and election administration links.
- **Google Calendar:** Generates add-to-calendar links for timeline milestones.
- **Google Maps:** Opens election-office and location searches based on the user’s region.
- **Google Cloud Run:** Hosts the production service with `min-instances=0`, `max-instances=1`, static caching, and Cloud Logging request visibility.

No API key is committed. For demo use, enter restricted API keys in the app’s Google services drawer.

## How It Works

1. Select a country/region, election type, voter situation, registration status, voting method, date, and location.
2. CivicPath generates a readiness score, priority action, timeline, checklist, official links, Google Calendar action, and Google Maps action.
3. Ask the assistant a question. Without a Gemini key, the app uses local logic. With a Gemini key, it asks Gemini for a concise response grounded in the local plan.
4. US users can add a Google Civic API key and residential address to retrieve official Civic API voter information when available.

## Assumptions

- Exact election rules, deadlines, and accepted documents vary by jurisdiction and can change. CivicPath is an educational planning assistant, not a legal authority.
- Google Civic Information API election data is US-focused and depends on API coverage for a given election and address.
- For non-US workflows, the app provides general process guidance and links to official or reputable civic information sources.
- Users should restrict browser API keys and avoid entering unnecessary sensitive data.

## Run Locally

```bash
npm run serve
```

Then open `http://localhost:5173`.

For a Cloud Run-style local server:

```bash
npm start
```

Then open `http://localhost:8080`.

## Test

```bash
npm test
```

The tests validate plan generation, urgency logic, intent detection, Google action URL creation, privacy-sensitive share text, static server routing, traversal protection, cache headers, lazy-loaded Google APIs, and payload budget.

Run the full quality check:

```bash
npm run check
```

## Deployment

Cloud Run deployment uses a small Node static server that listens on the `PORT` environment variable:

```bash
gcloud run deploy civic-path \
  --source . \
  --region asia-south1 \
  --allow-unauthenticated \
  --min-instances=0 \
  --max-instances=1
```

`.gcloudignore` excludes tests, docs, git metadata, and social assets from the source upload while keeping runtime files available.

## Quality, Security, and Accessibility

- No framework or runtime dependencies are required for the core app.
- The first render path avoids loading optional Google API clients until the user requests those features.
- API keys are never committed and are only saved when the user explicitly opts in.
- User and Gemini-generated text is rendered through `textContent`, not HTML injection.
- The server adds CSP, permissions, referrer, and `X-Content-Type-Options` headers, and blocks path traversal outside the project root.
- The UI uses semantic landmarks, labels, keyboard-focus styles, accessible contrast, responsive layout, and reduced-motion support.
- Deadline-sensitive guidance includes an official-source caveat instead of pretending to be a legal authority.


this was built as a project which was a part of google prompt for wars!

## Submission Notes

- Repository should be public.
- Keep one branch.
- Keep repository size below 10 MB.
- Commit all project code, including this README, `index.html`, `src/`, `assets/`, and `tests/`.