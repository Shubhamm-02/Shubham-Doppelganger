# Part C: Evals Report

## Project Summary

I built **Wizard**, a RAG-grounded AI representative for Shubham Shah. The system has two user-facing surfaces: a deployed web chat at `https://shubham-doppelganger.vercel.app/` and a Vapi voice agent deployed on `+16514778662`. Retrieval is backed by Supabase pgvector, with local keyword search as a fallback when vector retrieval is unavailable. Both surfaces use the same backend tools for profile search and calendar scheduling. The assistant answers questions from Shubham's resume, personal background, and project notes, and it can book fixed 15-minute interviews through Cal.com.

## Voice Quality Evaluation

I measured voice quality using three dimensions: **latency, accuracy, and task completion**.

For latency, I used Vapi call logs and turn-level timing metrics. In one representative test call, Vapi reported an average turn latency of roughly **2.7 seconds**, with the major components split across speech-to-text, endpointing, model response, and text-to-speech. The observed breakdown was approximately: transcriber latency around **675 ms**, model latency around **585 ms**, endpointing around **636 ms**, and voice generation around **216 ms**. This showed that the main latency bottleneck was not only the LLM, but also endpointing and transcription. I also manually judged whether the conversation felt interruptible, responsive, and natural during booking flows.

For accuracy, I reviewed voice transcripts and checked whether the assistant used the correct tool for the user intent. Profile questions such as age, education, projects, and background should call `search_profile` and answer only from verified project/resume data. Scheduling requests should enter scheduling mode and avoid switching back to RAG unless the user clearly asks a profile question. I also checked speech-recognition-sensitive cases like names and emails. Because email recognition is fragile in voice, the assistant now reads the email back and requires confirmation before booking.

For task completion, I tested the full voice booking path: user asks to book, assistant asks for a day, assistant reads available slots, user chooses a slot, assistant collects name and email, user confirms email, and Cal.com creates the booking. I also tested failure handling: using my own email (shubhamshah473@gmail.com)as attendee is rejected, unavailable days return no slots, and the assistant does not invent calendar availability. The phone number is currently a US number, `+16514778662`. I was able to deploy the voice agent there, but an Indian phone number would be better for local testing because international calling is difficult without an enabled international plan.

## Chat Groundedness Evaluation

I measured chat groundedness through manual eval cases and live smoke tests. The main checks were:

- **Retrieval quality:** whether the answer retrieved the right resume/project-note chunks.
- **Groundedness:** whether the final answer stayed within retrieved evidence.
- **Unsupported-question behavior:** whether the assistant refused or said it did not have the information instead of guessing.
- **Calendar separation:** whether scheduling stayed in calendar mode and did not accidentally answer from RAG.

The eval prompts included project-specific questions such as:

- "How does the PDF Grounded Chatbot avoid hallucinations?"
- "What anti-spam guardrails are in CommentAI?"
- "What role does FAISS play in the CCPA project?"
- "Why is Shubham a good fit for an AI agent / RAG role?"

I also tested unsupported questions, such as claims about awards or private information not present in the data. The expected behavior was to avoid hallucination and say the information was not available in the verified profile. After adding personal background notes and re-ingesting the data, the assistant could answer personal questions like age, education path, hobbies, and Scaler/BITS context from grounded sources.

## Failure Modes Found and Fixed

1. **Scheduling mode was being interrupted by RAG.**  
   During an interview-booking conversation, follow-up messages like "name is Dhruv" were sometimes interpreted as profile questions and sent to RAG. This produced irrelevant resume answers instead of continuing the scheduling flow. I fixed this by tracking active scheduling state in chat and by adding Vapi instructions that prevent RAG during scheduling unless the user explicitly asks a profile question.

2. **Cal.com booking failed because of an API payload mismatch.**  
   Availability lookup worked, but booking repeatedly failed. After reproducing the request directly against Cal.com, I found the exact error: the request included `lengthInMinutes`, but the Cal.com event type already had a fixed 15-minute length. Cal.com rejected the booking because variable lengths were not enabled. I removed `lengthInMinutes` from the booking payload and verified the fix with a real create-and-cancel diagnostic booking.

3. **Calendar/date parsing produced misleading slots.**  
   When the user asked for `May 10`, the system displayed `May 11` slots while still saying it checked `May 10`. This happened because the fallback logic showed the next available slots when no same-day slots existed. I fixed the date parser and slot selection logic so a requested day with no slots now correctly returns "no open 15-minute slot" instead of silently falling forward. I also fixed stale-context issues by making the parser prefer the latest email and latest date in the conversation.

## Improvements With Two More Weeks

With two more weeks, I would improve both the product depth and production readiness.

First, I would expand scheduling beyond the current India-only setup. Right now the assistant assumes Asia/Kolkata and offers up to three fixed 15-minute slots. I would add support for multiple time zones, flexible date ranges, flexible durations, and natural preferences such as "sometime next week afternoon" or "30 minutes after 5 PM." I would also make the assistant explain availability in the user's local time.

Second, I would reduce voice latency. The current voice flow works, but the experience can still feel slower than a human conversation. I would tune endpointing, use faster model/tool-call paths, cache common profile answers, stream shorter first responses, and benchmark different STT/TTS providers.

Third, I would improve the voice identity. A strong future version would use a custom personal voice for Wizard, similar to how a Scaler mock companion could have its own recognizable voice. This would make the agent feel more like a real AI representative instead of a generic voice bot.

Fourth, I would add multi-user support. Currently the app behaves like a single shared representative instance. A production version should support login, authorization, user-specific profile data, user-specific Cal.com/Vapi credentials, isolated chat sessions, and separate RAG indexes per user.

Finally, I would improve telephony deployment. The current deployed number is a US number because it was available through the free/low-cost setup. For an India-focused demo, I would add an Indian number so evaluators can call normally without international calling issues. I would also add better monitoring dashboards for call success rate, booking completion rate, retrieval hit rate, and hallucination reports.
