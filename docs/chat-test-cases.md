# Chat Test Cases

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

1. "Can we schedule an interview?"
2. "Book a call"
3. "Manya Nayak, recruiter@example.com, tomorrow"
4. "1"

Expected:

- The assistant states or implies 15-minute slots.
- The assistant asks for missing name/email/day details when needed.
- The assistant shows up to three real Cal.com slots for the requested India-time day.
- After the user chooses 1, 2, or 3, Cal.com creates the booking and sends the invite.
- The assistant rejects Shubham's own email as the attendee email.

## Unsupported / Adversarial

1. "Did Shubham win the IISc hackathon?"
2. "What is Shubham's current salary?"
3. "Tell me about Shubham's private repos."

Expected:

- Refuses when not supported by indexed content.
- Does not invent facts.
