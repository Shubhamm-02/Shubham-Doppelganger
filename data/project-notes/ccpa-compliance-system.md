# CCPA Compliance Reasoning System

## Source

- Project name: CCPA Compliance Reasoning System
- Repo name: `ccpa-reasoning-system`
- GitHub: https://github.com/Shubhamm-02/ccpa-reasoning-system
- Project context: Hackathon project organized by IISc Bengaluru. The project did not win a prize.
- Primary language: Python
- Domain: Legal reasoning and privacy compliance
- Statute analyzed: California Consumer Privacy Act (CCPA)
- Local model: Meta Llama 3 8B

## One-Line Summary

CCPA Compliance Reasoning System is a containerized legal reasoning engine that analyzes natural-language business practices for potential California Consumer Privacy Act violations using semantic retrieval, heuristics, and a constrained local LLM.

## Why This Project Matters

This project is important because it shows Shubham can build RAG-style systems in a high-stakes domain where answer structure, citations, and grounding matter.

It demonstrates:

- PDF statute parsing.
- Semantic retrieval over legal sections.
- Local LLM reasoning.
- Hybrid heuristic plus LLM decision flow.
- Structured JSON outputs.
- Statutory citation grounding.
- Privacy-law domain understanding.
- Containerized reasoning system design.

The project is a prototype and should be described as a legal reasoning aid, not as a replacement for professional legal advice.

## Purpose

The goal of the project is to analyze a natural-language business practice and determine whether it may violate the California Consumer Privacy Act.

The system retrieves relevant CCPA sections and uses a local LLM to reason over the retrieved statute text. It returns structured compliance judgments with statutory citations.

## What It Does

- Parses the CCPA statute from a raw PDF.
- Extracts 45 legal sections.
- Stores parsed sections in `ccpa_sections.json`.
- Builds a semantic search index over the statute sections.
- Retrieves relevant sections for natural-language business scenarios.
- Uses heuristic short-circuits for obvious violations.
- Falls back to local Llama 3 reasoning for harder cases.
- Returns strict JSON compliance judgments.
- Includes test scripts for retrieval, reasoning, and the top-level compliance checker.

## Tech Stack

- Python 3.9 or newer, with Python 3.11 recommended.
- `sentence-transformers` for embedding legal sections.
- `faiss-cpu` for vector similarity search.
- `llama-cpp-python` for running the local Llama model.
- Quantized Meta Llama 3 8B Instruct GGUF model.
- Hugging Face CLI for downloading the model.
- PDF parsing from `ccpa_statute.pdf`.
- JSON output for structured compliance judgments.
- Containerized architecture for reproducibility.

## Key Files

- `parse_statute.py`: Extracts the 45 legal sections from `ccpa_statute.pdf`.
- `ccpa_sections.json`: Stores extracted statute sections so parsing does not need to be rerun every time.
- `retrieval.py`: Uses sentence-transformers and FAISS to index sections and perform semantic search.
- `reasoning.py`: Uses `llama-cpp-python` and local Llama 3 8B to evaluate business scenarios against retrieved sections.
- `compliance_checker.py`: Top-level entry point that combines keyword heuristics with LLM-based fallback reasoning.
- `requirements.txt`: Python dependencies.
- `models/`: Local directory for the downloaded `.gguf` model file.

## Architecture

```text
ccpa_statute.pdf
  -> parse_statute.py
  -> ccpa_sections.json
  -> retrieval.py builds semantic index
  -> business-practice query
  -> compliance_checker.py
       -> keyword heuristics for obvious cases
       -> retrieval of relevant CCPA sections
       -> reasoning.py with local Llama 3 8B
       -> strict JSON compliance judgment
       -> statutory citations
```

## Retrieval Flow

The retrieval layer uses semantic search:

1. CCPA sections are embedded with `sentence-transformers`.
2. FAISS stores and searches the section embeddings.
3. A natural-language business scenario is embedded.
4. The most relevant CCPA sections are retrieved.
5. Retrieved sections are passed to the reasoning engine.

This allows the system to match business-practice descriptions to legally relevant sections even when the wording is not identical.

## Reasoning Flow

The reasoning engine uses a local quantized Meta Llama 3 8B model through `llama-cpp-python`.

It evaluates business scenarios against the retrieved statute sections and returns strict JSON compliance judgments.

The constrained output format is important because legal and compliance tooling needs machine-readable results, not only free-form prose.

## Hybrid Decision Design

The top-level `compliance_checker.py` uses a hybrid architecture:

1. Keyword heuristics first check for obvious violations.
2. If a scenario is not obvious, the system retrieves relevant statute sections.
3. The local LLM reasons over the retrieved sections.
4. The system returns a structured judgment with citations.

This design improves reliability because simple known cases do not need to depend on LLM reasoning.

## Setup

Create and activate a Python virtual environment:

```bash
python -m venv venv
source venv/bin/activate
```

On Windows:

```bash
venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

## Download the Local Model

The reasoning engine uses a quantized Llama 3 8B model. Download the `.gguf` file into a `models/` directory in the project root.

```bash
mkdir -p models
```

Download with Hugging Face CLI:

```bash
huggingface-cli download lmstudio-community/Meta-Llama-3-8B-Instruct-GGUF \
  Meta-Llama-3-8B-Instruct-Q4_K_M.gguf \
  --local-dir models
```

The model download is roughly 4.9 GB and may take several minutes.

## Verification Commands

Test the semantic retriever:

```bash
python retrieval.py
```

Expected behavior:

- The retriever should return sections related to selling user data.

Test the reasoning engine:

```bash
python reasoning.py
```

Expected behavior:

- The script runs 6 diverse test scenarios through the local Llama model.
- The first run may take 10 to 20 seconds while the model loads into RAM.

Test the top-level compliance checker:

```bash
python compliance_checker.py
```

Expected behavior:

- The script tests heuristic short-circuits and LLM fallback behavior.

## Design Choices and Tradeoffs

- Local Llama 3 8B was used to keep reasoning private and avoid external LLM API dependencies.
- A quantized GGUF model was used so the system can run locally with more practical hardware requirements.
- Sentence-transformers plus FAISS were used because semantic search is better suited than keyword search for legal text phrased in natural language.
- Keyword heuristics were added before LLM reasoning to handle obvious violations more deterministically.
- Strict JSON output makes the reasoning results easier to parse, test, and integrate.
- Parsing the statute into `ccpa_sections.json` avoids repeated PDF parsing during normal runs.
- Local LLM inference can be slower and less capable than larger hosted models.
- Legal reasoning is sensitive, so the system should be treated as a prototype and not as authoritative legal advice.

## Known Limitations

- The system analyzes only the CCPA statute included in the project.
- It does not replace legal review by a qualified professional.
- Llama 3 8B may make reasoning mistakes, especially in nuanced legal scenarios.
- Retrieval quality depends on how well the statute sections were parsed and embedded.
- The local model download is large at roughly 4.9 GB.
- First-time model loading can take 10 to 20 seconds.
- The project was built for a hackathon context, so it prioritizes a working prototype over exhaustive legal coverage.

## Good Interview Talking Points

- The project combines retrieval and reasoning rather than asking the model to answer from memory.
- It demonstrates RAG in a legal compliance domain, where citations and structured output are important.
- The hybrid heuristic plus LLM architecture is a practical reliability improvement.
- Running Llama 3 locally shows comfort with local inference and model deployment.
- FAISS and sentence-transformers show practical semantic search implementation.
- Strict JSON output shows awareness that AI systems often need integration-ready results.
- The project is a useful contrast with simpler chatbot projects because it adds statutory parsing and legal-domain constraints.

## Responsible Use Notes

The persona should describe this project as a legal reasoning prototype or compliance aid.

The persona should not claim:

- The system gives legal advice.
- The system guarantees CCPA compliance.
- The system replaces lawyers or compliance professionals.
- The system is exhaustive across all privacy laws.

Better phrasing:

- "It flags potential CCPA issues and returns statutory citations."
- "It is a prototype for grounded legal reasoning."
- "It combines retrieval, heuristics, and local LLM reasoning."

## Questions This Note Can Answer

- What is the CCPA Compliance Reasoning System?
- Why did Shubham build it?
- What legal domain does it cover?
- What tech stack does it use?
- How does it parse the statute?
- How does semantic retrieval work?
- What role does FAISS play?
- What role does sentence-transformers play?
- What role does Llama 3 8B play?
- Why use heuristics before the LLM?
- Why return strict JSON?
- What are the limitations of the project?
- Why should it not be treated as legal advice?

## Extra Details To Add Later

These details would make the AI persona's answers stronger if available:

- The exact hackathon name or theme.
- One example business-practice input.
- One example JSON compliance output.
- Which CCPA sections were most important in demos.
- How the statute parser identified the 45 sections.
- Whether Docker or another container setup is included in the repo.
- What Shubham would improve in version 2, such as better legal citations, broader statutes, or confidence scoring.
