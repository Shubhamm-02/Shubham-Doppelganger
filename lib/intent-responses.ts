import type { ProfileAnswer } from "@/lib/rag";
import type { ChatIntent } from "@/lib/intent";
import { bookInterview, getAvailability } from "@/lib/calendar";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DATE_PATTERN =
  /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;
const TIME_PATTERN = /\b(\d{1,2})(:\d{2})?\s*(am|pm)\b|\b\d{1,2}\s*-\s*\d{1,2}\b/i;

function isBookingConfirmation(message: string) {
  return (
    /^\s*[1-3]\s*$/.test(message) ||
    /\b(yes|yep|yeah|confirm|confirmed|book it|book this|book the|go ahead|sounds good|that works|lock it|schedule it|first one|second one|third one|slot\s*[1-3])\b/i.test(
      message
    )
  );
}

function summarizeSchedulingDetails(message: string) {
  const email = message.match(EMAIL_PATTERN)?.[0];
  const hasDate = DATE_PATTERN.test(message);
  const hasSpecificTime = TIME_PATTERN.test(message);
  const withoutEmail = message.replace(EMAIL_PATTERN, " ");
  const schedulingWords = new Set([
    "ok",
    "yes",
    "yep",
    "today",
    "tomorrow",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
    "sat",
    "sun",
    "ist",
    "gmt",
    "utc",
    "est",
    "edt",
    "cst",
    "cdt",
    "mst",
    "mdt",
    "pst",
    "pdt",
    "cet",
    "cest",
    "bst",
    "aest",
    "aedt",
    "am",
    "pm"
  ]);
  const possibleNameTokens = withoutEmail
    .toLowerCase()
    .replace(/[^a-z\s.'-]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !schedulingWords.has(token));
  const hasName =
    /\bname\s*(?::|is|-)\s*[a-z][a-z\s.'-]{1,}/i.test(withoutEmail) ||
    /\b(i am|this is)\s+[a-z][a-z\s.'-]{1,}/i.test(withoutEmail) ||
    possibleNameTokens.length >= 2;

  const missing = [];
  if (!hasName) missing.push("your name");
  if (!email) missing.push("your email");
  if (!hasDate) missing.push("the day/date");
  if (!hasSpecificTime) missing.push("a specific time window");

  return { email, hasDate, hasName, hasSpecificTime, missing };
}

export async function calendarIntentResponse(
  intent: ChatIntent,
  message = "",
  latestMessage = message
): Promise<ProfileAnswer> {
  const details = summarizeSchedulingDetails(message);

  if (intent === "availability") {
    if (message && details.hasDate && details.hasSpecificTime) {
      const calendarResult = await getAvailability({
        text: message,
        preferredWindow: message
      });

      return {
        answer: calendarResult.message,
        citations: [],
        grounded: true,
        retrievalMode: calendarResult.configured ? "calendar" : "local-keyword"
      };
    }

    return {
      answer:
        "I can help schedule a 15-minute interview in India time. Tell me 2-3 windows that work for you (for example: Tue 2-5pm or Wed 11am-1pm), and I will propose slots from Shubham's real calendar.",
      citations: [],
      grounded: true,
      retrievalMode: "local-keyword"
    };
  }

  if (message && details.missing.length === 0) {
    const calendarResult = isBookingConfirmation(latestMessage)
      ? await bookInterview({ text: message, selection: latestMessage })
      : await getAvailability({
          text: message,
          preferredWindow: message
        });

    return {
      answer: calendarResult.message,
      citations: [],
      grounded: true,
      retrievalMode: calendarResult.configured ? "calendar" : "local-keyword"
    };
  }

  if (message && details.missing.length < 4) {
    const known = [
      details.email ? `email: ${details.email}` : null,
      details.hasName ? "name: received" : null,
      details.hasDate ? "day/date: received" : null,
      details.hasSpecificTime ? "time window: received" : null
    ].filter(Boolean);

    return {
      answer:
        `Got it${known.length ? ` (${known.join(", ")})` : ""}. ` +
        `I still need ${details.missing.join(", ")} before I can propose or book a 15-minute slot.` +
        "\n\nExample: Shubham Shah, shubham@example.com, tomorrow 3-5pm.",
      citations: [],
      grounded: true,
      retrievalMode: "local-keyword"
    };
  }

  return {
    answer:
      "I can book a 15-minute interview in India time. Please share:\n\n1. Your name\n2. Your email (needed for the calendar invite)\n3. A preferred day/time window\n\nThen I will propose available slots and book it end-to-end.",
    citations: [],
    grounded: true,
    retrievalMode: "local-keyword"
  };
}
