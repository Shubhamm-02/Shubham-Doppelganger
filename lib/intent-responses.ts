import type { ProfileAnswer } from "@/lib/rag";
import type { ChatIntent } from "@/lib/intent";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const TIMEZONE_PATTERN =
  /\b(ist|gmt|utc|est|edt|cst|cdt|mst|mdt|pst|pdt|cet|cest|bst|aest|aedt)\b/i;
const DATE_PATTERN =
  /\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;
const TIME_PATTERN = /\b(\d{1,2})(:\d{2})?\s*(am|pm)\b|\b\d{1,2}\s*-\s*\d{1,2}\b/i;

function summarizeSchedulingDetails(message: string) {
  const email = message.match(EMAIL_PATTERN)?.[0];
  const timezone = message.match(TIMEZONE_PATTERN)?.[0]?.toUpperCase();
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
    /\bname\s*:\s*[a-z][a-z\s.'-]{1,}/i.test(withoutEmail) ||
    possibleNameTokens.length >= 2;

  const missing = [];
  if (!hasName) missing.push("your name");
  if (!email) missing.push("your email");
  if (!timezone) missing.push("your timezone");
  if (!hasDate) missing.push("the day/date");
  if (!hasSpecificTime) missing.push("a specific time window");

  return { email, timezone, hasDate, hasName, hasSpecificTime, missing };
}

export function calendarIntentResponse(
  intent: ChatIntent,
  message = ""
): ProfileAnswer {
  if (intent === "availability") {
    return {
      answer:
        "I can help schedule an interview. Tell me your timezone and 2-3 windows that work for you (for example: Tue 2-5pm IST, Wed 11am-1pm IST), and I will propose slots from Shubham's real calendar.",
      citations: [],
      grounded: true,
      retrievalMode: "local-keyword"
    };
  }

  const details = summarizeSchedulingDetails(message);
  if (message && details.missing.length === 0) {
    return {
      answer:
        "Thanks, I have the details I need: name, email, timezone, day/date, and a time window. I can now use the calendar booking flow to propose or book the interview slot.",
      citations: [],
      grounded: true,
      retrievalMode: "local-keyword"
    };
  }

  if (message && details.missing.length < 4) {
    const known = [
      details.email ? `email: ${details.email}` : null,
      details.timezone ? `timezone: ${details.timezone}` : null,
      details.hasName ? "name: received" : null,
      details.hasDate ? "day/date: received" : null,
      details.hasSpecificTime ? "time window: received" : null
    ].filter(Boolean);

    return {
      answer:
        `Got it${known.length ? ` (${known.join(", ")})` : ""}. ` +
        `I still need ${details.missing.join(", ")} before I can propose or book a slot.` +
        "\n\nExample: Shubham Shah, shubham@example.com, IST, tomorrow 3-5pm.",
      citations: [],
      grounded: true,
      retrievalMode: "local-keyword"
    };
  }

  return {
    answer:
      "I can book an interview. Please share:\n\n1. Your name\n2. Your email (needed for the calendar invite)\n3. Your timezone\n4. A preferred day/time window\n\nThen I will propose available slots and book it end-to-end.",
    citations: [],
    grounded: true,
    retrievalMode: "local-keyword"
  };
}
