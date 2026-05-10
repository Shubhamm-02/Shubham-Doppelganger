const BOOKING_KEYWORDS = [
  "book",
  "schedule",
  "set up",
  "setup",
  "call",
  "meet",
  "meeting",
  "interview",
  "slot",
  "availability",
  "available",
  "calendar"
];

export type ChatIntent = "profile" | "availability" | "booking";

const TIMEZONE_PATTERN =
  /\b(ist|gmt|utc|est|edt|cst|cdt|mst|mdt|pst|pdt|cet|cest|bst|aest|aedt)\b/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DATE_PATTERN =
  /\b(today|tomorrow|day after tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty first|twenty second|twenty third|twenty fourth|twenty fifth|twenty sixth|twenty seventh|twenty eighth|twenty ninth|thirtieth|thirty first)\b/i;
const TIME_PATTERN = /\b(\d{1,2})(:\d{2})?\s*(am|pm)\b|\b\d{1,2}\s*-\s*\d{1,2}\b/i;

export function classifyIntent(message: string): ChatIntent {
  const normalized = message.toLowerCase();
  const matched = BOOKING_KEYWORDS.some((keyword) => normalized.includes(keyword));
  const looksLikeBookingDetails =
    EMAIL_PATTERN.test(message) ||
    (TIMEZONE_PATTERN.test(message) && (DATE_PATTERN.test(message) || TIME_PATTERN.test(message))) ||
    DATE_PATTERN.test(message) ||
    (DATE_PATTERN.test(message) && TIME_PATTERN.test(message));

  if (!matched && !looksLikeBookingDetails) return "profile";

  if (normalized.includes("availability") || normalized.includes("available")) {
    return "availability";
  }

  return "booking";
}

export function isExplicitProfileRequest(message: string) {
  return /\b(project|projects|resume|cv|skill|skills|experience|github|linkedin|education|college|internship|tech stack|built|portfolio)\b/i.test(
    message
  );
}

export function isSchedulingCancelRequest(message: string) {
  return /\b(cancel|stop|never mind|nevermind|forget it|leave it)\b/i.test(message);
}
