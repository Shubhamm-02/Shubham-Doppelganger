# PDF-Grounded Chatbot

## Source

- Project name: PDF-Grounded Chatbot
- Deployed app: https://stair-digital.streamlit.app/
- GitHub: https://github.com/Shubhamm-02/Stair-Digital
- Context: Internship assignment for Stair Digital.
- Opportunity source: The application opportunity was shared through Scaler School of Technology.
- Primary language: Python
- Main interface file: `app.py`
- Shared agent logic file: `pdf_rag.py`

## One-Line Summary

PDF-Grounded Chatbot is a Streamlit app that answers questions strictly from a user-uploaded PDF, includes page-number citations, and refuses out-of-scope questions with a fixed response.

## Why This Project Matters

This project is important because it directly demonstrates practical RAG skills:

- PDF parsing.
- Retrieval over document excerpts.
- Prompt-level grounding.
- Citation enforcement.
- Out-of-scope refusal.
- Local validation guardrails.
- Deployed chatbot UX.
- Manual evaluator test cases.

It is highly relevant to AI agent and RAG-based interview tasks because the system is designed to avoid hallucinations instead of simply producing fluent answers.

This was built as an internship assignment for Stair Digital. The opportunity to apply was shared with Shubham through Scaler School of Technology.

## Purpose

The goal of the project is to let a user upload a PDF and ask questions about it while ensuring the chatbot only answers when the uploaded PDF supports the answer.

If the answer is not supported by retrieved PDF context, the app must return exactly:

```text
This question is outside the scope of the provided PDF.
```

## What It Does

- Runs as a Streamlit chatbot.
- Accepts a user-uploaded PDF.
- Extracts page-numbered text locally.
- Retrieves the most relevant PDF pages for each question.
- Sends only retrieved excerpts to the OpenAI Responses API.
- Answers valid questions with page-number citations.
- Refuses unsupported or out-of-scope questions.
- Provides preset demo questions when the uploaded file is named exactly `sample.pdf`.
- Supports an optional conservative local fallback if the OpenAI account has no quota.

## Tech Stack

- Language: Python.
- Web interface: Streamlit.
- PDF parsing: PyMuPDF.
- Retrieval: Lightweight lexical retriever.
- LLM API: OpenAI Responses API.
- Default model: `gpt-4.1-mini`.
- Configurable model env var: `OPENAI_MODEL`.
- Optional fallback env var: `ALLOW_EXTRACTIVE_FALLBACK=true`.
- Deployment: Streamlit Community Cloud.

## Key Files

- `app.py`: Streamlit interface.
- `pdf_rag.py`: PDF extraction, retrieval, OpenAI call, fallback behavior, and citation guard.
- `requirements.txt`: Python dependencies.
- `.env.example`: Environment variable template.
- `sample.pdf`: Sample PDF used for testing.
- `test_queries.md`: 5 valid and 3 invalid test queries with expected behavior.
- `TECHNICAL_NOTE.md`: Architecture, decisions, and tradeoffs.
- `TEST_INSTRUCTIONS.md`: Evaluator setup and manual acceptance checks.

## Architecture

```text
User uploads PDF
  -> app.py
  -> PyMuPDF extracts page-numbered text
  -> pdf_rag.py indexes page text
  -> lexical retriever selects relevant pages
  -> OpenAI Responses API receives only retrieved excerpts
  -> model generates grounded answer or refusal
  -> local output guard validates citations/refusal
  -> Streamlit displays final answer
```

## How Grounding Works

The project uses several layers of grounding:

1. The PDF is parsed locally with PyMuPDF into page-numbered text.
2. A lexical retriever selects relevant pages for the user question.
3. OpenAI receives only:
   - retrieved page excerpts,
   - recent conversation context,
   - the current user question.
4. The prompt requires refusal when retrieved pages do not support the answer.
5. A local output guard checks the model response before showing it to the user.

The local output guard is important because it reduces reliance on prompt instructions alone.

## Citation Guardrails

The output guard:

- Normalizes refusals.
- Rejects uncited answers.
- Rejects citations to pages that were not supplied in the retrieved context.
- Enforces the exact refusal message for unsupported questions.

This means the app does not simply trust the LLM. It validates that answers are tied to retrieved PDF pages.

## Refusal Behavior

Unsupported questions must return exactly:

```text
This question is outside the scope of the provided PDF.
```

This fixed refusal makes testing easier because invalid answers can be checked deterministically.

## Fallback Behavior

If the OpenAI account has no quota, the app can use a conservative local fallback when this is set:

```bash
ALLOW_EXTRACTIVE_FALLBACK=true
```

The fallback returns retrieved PDF sentences with page citations instead of asking the model to generate a broader answer.

This makes the app more robust during demos and evaluator testing.

## Setup

Create and activate a Python virtual environment:

```bash
python3 -m venv venv
source venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

Create a `.env` file:

```bash
cp .env.example .env
```

Then add:

```bash
OPENAI_API_KEY=your_openai_api_key_here
```

Optional model settings:

```bash
OPENAI_MODEL=gpt-4.1-mini
OPENAI_FALLBACK_MODELS=
ALLOW_EXTRACTIVE_FALLBACK=true
```

## Run Locally

```bash
source venv/bin/activate
streamlit run app.py
```

Streamlit opens a local browser tab. Upload `sample.pdf`, then ask questions from `test_queries.md`.

When the uploaded file is named exactly `sample.pdf`, the app shows preset demo questions as one-click buttons. These buttons use the same chat pipeline as typed questions and exist only to make evaluator demos faster.

## Testing

After uploading `sample.pdf`, run every query in `test_queries.md`.

Expected behavior:

- Valid queries should produce answers that are correct relative to the PDF and include a `(Page N)` citation.
- Invalid queries should return exactly: `This question is outside the scope of the provided PDF.`

Optional multilingual check:

- Ask a valid question in Hindi, Spanish, or another language.
- The answer should stay in that language while preserving `(Page N)` citations.
- Unsupported questions should still return the exact refusal string.

## Design Choices and Tradeoffs

- Streamlit was used because it makes a working chatbot interface fast to build and easy to deploy.
- PyMuPDF was used for local PDF extraction so document parsing does not depend on a remote service.
- A lightweight lexical retriever keeps the project simple and explainable.
- The OpenAI Responses API only receives retrieved excerpts, which limits the model's opportunity to hallucinate.
- The local output guard adds deterministic validation after model generation.
- The fixed refusal string makes invalid-query testing reliable.
- The fallback mode improves demo reliability if the OpenAI account has quota issues.
- Lexical retrieval is simpler than embeddings but may miss semantically related passages that use different wording.

## Known Limitations

- The retriever is lexical, so it may perform worse than embedding-based retrieval on paraphrased questions.
- The app is optimized for PDF-grounded QA, not general chat.
- The local extractive fallback is conservative and may produce less fluent answers than the model.
- The app relies on the quality of extracted PDF text, so scanned image-only PDFs may require OCR support.
- The system is designed around page-level citations, not paragraph-level or sentence-level citations.

## Good Interview Talking Points

- The project shows that Shubham understands RAG is not just "send a PDF to an LLM"; it needs retrieval, grounding, and validation.
- The local output guard is a strong design choice because it checks citations and refusals after generation.
- The app is strict about refusing unsupported questions, which directly addresses hallucination risk.
- The fallback mode shows practical thinking about demo reliability and API quota failures.
- The testing files show that the project was built with evaluator acceptance checks in mind.
- The project is deployed publicly, which shows end-to-end delivery rather than only local experimentation.

## Questions This Note Can Answer

- What is PDF-Grounded Chatbot?
- Why is this project important?
- What tech stack does it use?
- How does the chatbot stay grounded?
- How does it prevent hallucinations?
- What happens for out-of-scope questions?
- How are page citations enforced?
- What is the role of `app.py`?
- What is the role of `pdf_rag.py`?
- How can someone run it locally?
- How was it tested?
- What are the tradeoffs of lexical retrieval?
- What would be improved in a future version?

## Extra Details To Add Later

These details would make the AI persona's answers stronger if available:

- The GitHub repository URL.
- What PDF was used as `sample.pdf`.
- One example valid question and expected answer.
- One example invalid question and expected refusal.
- Any bug found while building the citation guard.
- Why lexical retrieval was chosen over vector embeddings.
- What Shubham would improve in version 2, such as embedding retrieval, OCR, better chunking, or citation spans.
