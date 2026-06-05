# Demo Checklist

Use this as the final assignment walkthrough.

## 1. Chat Profile Q&A

Prompt:

```text
Why is Shubham a good fit for this role?
```

Expected:

- Answer is grounded in resume/project notes.
- No unsupported claims.
- Copy button changes to a tick after copying.

## 2. Chat Calendar Booking

Prompts:

```text
Book a call
```

```text
Manya Nayak
recruiter@example.com
tomorrow
```

```text
1
```

Expected:

- Assistant shows real 15-minute Cal.com slots.
- Booking confirms after choosing a slot.
- Calendar invite is sent to the attendee email.

## 3. Voice Profile Q&A

Prompt:

```text
What is Shubham's age?
```

Expected:

- Voice calls the profile tool.
- Answer is short and spoken naturally.

## 4. Voice Calendar Booking

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
- Scheduling is India-only.
- Meetings are fixed at 15 minutes.
