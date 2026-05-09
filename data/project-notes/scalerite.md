i made this because my college friends took lot of time finding out the details and poc and stuff at Scaler school of technology, this chatbot helped saving time by answering quickly

# 🎓 scAlerite — College Academic Chatbot

A **RAG-powered Telegram bot** that answers academic queries using your college's official policy documents.

Built with: **Python** · **FastAPI** · **FAISS** · **Sentence-Transformers** · **Google Gemini** · **python-telegram-bot**

---

## 🏗️ Architecture

```
User Question (Telegram)
        │
        ▼
┌─────────────────┐     HTTP POST     ┌──────────────┐
│  Telegram Bot   │ ────────────────▶ │  FastAPI      │
│  (telegram_bot) │ ◀──────────────── │  /query       │
└─────────────────┘   JSON response   └──────┬───────┘
                                              │
                              ┌───────────────┼───────────────┐
                              ▼               ▼               ▼
                         1. Embed        2. FAISS         3. Gemini
                         Question        Search           Generate
                         (MiniLM)        (Top-K)          Answer
```

## 📁 Project Structure

```
scAlerite/
├── app/
│   ├── utils.py           # PDF → Text → Chunks (with source tracking)
│   ├── embedding.py       # Text → 384-dim vectors (CPU, numpy, batching)
│   ├── vector_store.py    # FAISS IndexFlatL2 semantic search
│   ├── main.py            # FastAPI backend + Gemini LLM integration
│   └── telegram_bot.py    # Async Telegram bot
├── data/                  # Drop your PDF policy documents here
├── tests/
│   └── test_utils.py      # Unit tests for text processing
├── .env                   # API keys (gitignored)
├── .gitignore
├── requirements.txt
└── README.md
```

## 🚀 Quick Start

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Configure Environment
Create a `.env` file in the project root:
```env
TELEGRAM_TOKEN=your_telegram_bot_token
GEMINI_API_KEY=your_gemini_api_key
BACKEND_URL=http://localhost:8000
```

### 3. Add Your PDFs
Drop your college policy PDFs into the `data/` directory.

### 4. Run the App (Two Terminals)

**Terminal 1 — Backend:**
```bash
python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

**Terminal 2 — Bot:**
```bash
python3 -m app.telegram_bot
```

### 5. Chat!
Open Telegram, find your bot, and send `/start`.

## 🧪 Run Tests
```bash
python3 -m pytest tests/ -v
```

## 🧠 NLP Concepts Used

| Concept | Implementation |
|---|---|
| Text Extraction | `pdfplumber` for PDF parsing |
| Text Chunking | 400-word sliding window with 50-word overlap |
| Embeddings | `all-MiniLM-L6-v2` (384 dimensions) |
| Vector Search | FAISS `IndexFlatL2` (Euclidean distance) |
| Answer Generation | Google Gemini 2.0 Flash (RAG prompt) |

## 📜 License

MIT