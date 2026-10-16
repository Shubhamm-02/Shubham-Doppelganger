# Demo Checklist

Use this as the final assignment walkthrough.

## 1. Chat Profile Q&A

Prompt:

```text
Why is Shubham a good fit for this role?
```

Expected:

- The status line shows "Searching resume and project notes", then the answer streams in.
- Answer is grounded in resume/project notes, with source chips under it.
- No unsupported claims.
- Copy turns into a tick after copying; Regenerate replaces the answer in place.

## 2. Chat Calendar Booking (slot picker)

1. Click **Book a 15-min call** on the landing page.
2. Pick a day, then one of the open times (in IST, plus your local time when it differs).
3. Enter a name and an interviewer email, review, and confirm.

Expected:

- Slots are real 15-minute Cal.com openings for that day.
- The reply becomes a booking card with the time, the meeting link (when Cal.com returns one), and an `.ics` download.
- The calendar invite reaches the attendee email.

## 3. Chat Calendar Booking (typed)

Prompts, one per message:

```text
Book a call
```

```text
tomorrow
```

```text
1
```

```text
Manya Nayak, recruiter@example.com
```

```text
yes
```

Expected:

- The assistant asks for a day, lists numbered slots, asks for name and email, then reads the booking back and waits for "yes".
- Booking confirms only after "yes".
- Giving Shubham's own email is rejected with a clear explanation.

## 4. Voice Profile Q&A

Prompt:

```text
What is Shubham's age?
```

Expected:

- Voice calls the profile tool.
- Answer is short and spoken naturally.

## 5. Voice Calendar Booking

Flow:

1. Ask to book an interview.
2. Give a day/date.
3. Choose one of the offered slots.
4. Provide name and attendee email.
5. Confirm the email.

Expected:

- Assistant does not ask for timezone.
- Assistant does not use RAG while scheduling unless asked a profile question.
- Booking confirms end-to-end through Cal.com.

## Notes

- Use an interviewer/recruiter email, not Shubham's own email.
- Scheduling is India-only (Asia/Kolkata).
- Meetings are fixed at 15 minutes.
- Chat history is private to the browser that created it (a signed cookie); another browser sees an empty sidebar.
