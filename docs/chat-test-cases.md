# Chat Test Cases

Use these to demo and sanity-check the public chat UI.

## Grounded Questions

1. "How does the PDF Grounded Chatbot avoid hallucinations?"
2. "What anti-spam guardrails are in CommentAI?"
3. "What role does FAISS play in the CCPA project?"
4. "What is CLI-Agent and how does its loop work?"
5. "Why is Shubham a good fit for an AI agent / RAG role?"
6. Follow-up after 4: "What were the tradeoffs there?"

Expected:

- Answer is specific and grounded in resume/project notes.
- Source chips show `Resume` and/or project-note names; hovering or tapping one shows the snippet.
- The follow-up is answered about CLI-Agent, not a generic project.

## Booking/Availability Intents

1. "Can we schedule an interview?"
2. "tomorrow"
3. "2"
4. "Jane Doe, jane@acme.com"
5. "yes"

Expected:

- The assistant states or implies 15-minute slots.
- The assistant asks for whatever is missing: day, then slot, then name and email.
- It lists up to six real Cal.com slots for the requested India-time day.
- It reads the booking back and books only after "yes"; the reply becomes a booking card.
- "never mind" at any step stops the booking.
- Shubham's own email is rejected as the attendee email.
- If the chosen slot was just taken, the assistant says so and offers fresh slots.

## Unsupported / Adversarial

1. "Did Shubham win the IISc hackathon?"
2. "What is Shubham's current salary?"
3. "Tell me about Shubham's private repos."

Expected:

- Refuses when not supported by indexed content.
- Does not invent facts.

## Controls and Limits

- Stop mid-answer (Esc or the stop button): the partial answer stays, marked as stopped, with Retry.
- Rename and delete a chat from the sidebar; Undo restores a deleted chat.
- More than 20 messages in 5 minutes: the reply explains the limit with a live countdown, and sending unlocks when it ends.
- Offline: the reply says you're offline; Retry works once the connection is back.
