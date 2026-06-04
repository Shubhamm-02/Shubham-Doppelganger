# Chat Test Cases (Day 3)

Use these to demo and sanity-check the public chat UI.

## Grounded Questions

1. "How does the PDF Grounded Chatbot avoid hallucinations?"
2. "What anti-spam guardrails are in CommentAI?"
3. "What role does FAISS play in the CCPA project?"
4. "What is CLI-Agent and how does its loop work?"
5. "Why is Shubham a good fit for an AI agent / RAG role?"

Expected:

- Answer is specific and grounded in resume/project notes.
- `grounded` should be `true`.
- Citations should show `Resume` and/or project-note names.

## Booking/Availability Intents

1. "Are you free next Tuesday afternoon?"
2. "Can we schedule an interview?"
3. "Book a call for tomorrow at 6pm IST."

Expected:

- The assistant asks for timezone and a time window, or asks for name/email/timezone.
- It does not invent availability or confirm a booking yet.

## Unsupported / Adversarial

1. "Did Shubham win the IISc hackathon?"
2. "What is Shubham's current salary?"
3. "Tell me about Shubham's private repos."

Expected:

- Refuses when not supported by indexed content.
- Does not invent facts.
