import type { ProfileAnswer } from "@/lib/rag";
import type { ChatIntent } from "@/lib/intent";
import { bookInterview, getAvailability } from "@/lib/calendar";
import { isKnownCallerName } from "@/lib/scheduling-names";

const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DATE_PATTERN =
  /\b(today|tomorrow|day after tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty first|twenty second|twenty third|twenty fourth|twenty fifth|twenty sixth|twenty seventh|twenty eighth|twenty ninth|thirtieth|thirty first)\b/i;
const TIME_PATTERN = /\b(\d{1,2})(:\d{2})?\s*(am|pm)\b|\b\d{1,2}\s*-\s*\d{1,2}\b/i;
const SCHEDULING_COMMAND_PATTERN =
  /\b(book|schedule|set\s*up|call|meet|meeting|interview|slot|availability|available|calendar)\b/i;
const NON_NAME_PATTERN =
  /\b(ok|okay|yes|yep|yeah|no|confirm|confirmed|first|second|third|tomorrow|today|morning|afternoon|evening|night|received|name|email|mail|gmail|phone|number)\b/i;

function isBookingConfirmation(message: string) {
  return (
    /^\s*[1-3]\s*$/.test(message) ||
    /\b(yes|yep|yeah|confirm|confirmed|book it|book this|book the|go ahead|sounds good|that works|lock it|schedule it|first one|second one|third one|slot\s*[1-3])\b/i.test(
      message
    )
  );
}

function cleanNameCandidate(candidate: string) {
  return candidate
    .replace(EMAIL_PATTERN, " ")
    .replace(/\b(email|mail|gmail|timezone|ist|utc|gmt|tomorrow|today|at|on|for|from)\b.*$/i, "")
    .replace(/[^a-z\s.'-]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeName(candidate: string) {
  const clean = cleanNameCandidate(candidate);
  if (isKnownCallerName(clean)) return true;
  if (!clean || SCHEDULING_COMMAND_PATTERN.test(clean) || NON_NAME_PATTERN.test(clean)) {
    return false;
  }

  const words = clean.split(/\s+/).filter(Boolean);
  return (
    words.length >= 1 &&
    words.length <= 4 &&
    words.every((word) => word.length > 1)
  );
}

function hasExplicitName(message: string) {
  const match = message.match(
    /\b(?:my\s+name\s+is|name\s*(?::|is|-)|i\s+am|i'm|this\s+is)\s+([a-z][a-z\s.'-]{1,})/i
  );

  return Boolean(match?.[1] && looksLikeName(match[1]));
}

function hasCompactNameBeforeEmail(message: string, email?: string) {
  if (!email) return false;

  const beforeEmail = message.split(email)[0].split(/\n/).pop() ?? "";
  return looksLikeName(beforeEmail);
}

function hasStandaloneNameLine(message: string) {
  return message
    .split(/\n+/)
    .some((line) => looksLikeName(line));
}

function summarizeSchedulingDetails(message: string) {
  const email = message.match(EMAIL_PATTERN)?.[0];
  const hasDate = DATE_PATTERN.test(message);
  const hasSpecificTime = TIME_PATTERN.test(message);
  const withoutEmail = message.replace(EMAIL_PATTERN, " ");
  const hasName =
    hasExplicitName(withoutEmail) ||
    hasCompactNameBeforeEmail(message, email) ||
    hasStandaloneNameLine(withoutEmail);

  const missing = [];
  if (!hasName) missing.push("your name");
  if (!email) missing.push("your email");
  if (!hasDate) missing.push("the day/date");

  return { email, hasDate, hasName, hasSpecificTime, missing };
}

export async function calendarIntentResponse(
  intent: ChatIntent,
  message = "",
  latestMessage = message
): Promise<ProfileAnswer> {
  const details = summarizeSchedulingDetails(message);

  if (intent === "availability") {
    if (message && details.hasDate) {
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
        "I can help schedule a 15-minute interview. Which day should I check? You can say tomorrow, day after tomorrow, May 11, or eleventh May.",
      citations: [],
      grounded: true,
      retrievalMode: "local-keyword"
    };
  }

  if (
    message &&
    details.hasDate &&
    !isBookingConfirmation(latestMessage)
  ) {
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
      details.hasDate ? "day/date: received" : null
    ].filter(Boolean);

    return {
      answer:
        `Got it${known.length ? ` (${known.join(", ")})` : ""}. ` +
        `I still need ${details.missing.join(", ")} before I can propose or book a 15-minute slot.` +
        "\n\nExample: Shubham Shah, shubham@example.com, May 11.",
      citations: [],
      grounded: true,
      retrievalMode: "local-keyword"
    };
  }

  return {
    answer:
      "I can book a 15-minute interview. First, which day should I check? You can say tomorrow, day after tomorrow, May 11, or eleventh May.",
    citations: [],
    grounded: true,
    retrievalMode: "local-keyword"
  };
}
