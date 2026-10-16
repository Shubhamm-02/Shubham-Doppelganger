import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { SchedulingStep } from "@/lib/chat/types";
import { hasChatProvider, reasoningParams } from "@/lib/llm/client";
import { withChatProviderFallback } from "@/lib/llm/fallback";

export type RouteInput = {
  message: string;
  schedulingStep: SchedulingStep;
  history: Array<{ user: string; assistant: string | null }>;
};

export type RouteDecision = {
  intent: "profile" | "scheduling" | "cancel_scheduling";
  query: string;
  via: "fast-path" | "llm" | "fallback";
};

export type Classifier = (
  input: RouteInput,
  signal?: AbortSignal
) => Promise<{
  intent: RouteDecision["intent"];
  standaloneQuestion: string;
}>;

const ROUTER_TIMEOUT_MS = 4000;
const ROUTER_MAX_TOKENS = 150;
// Reasoning tokens count against the completion budget, so reasoning models need room to think.
const REASONING_ROUTER_MAX_TOKENS = 1024;
const ROUTER_HISTORY_TURNS = 3;
const ASSISTANT_CONTEXT_CHARS = 300;
const SHORT_REPLY_WORDS = 6;

const MONTH =
  "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";
const DAY_OF_MONTH =
  "\\d{1,2}(?:st|nd|rd|th)?|(?:twenty|thirty)?[\\s-]?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|thirtieth";

// A bare "may", "first" or "second" is never a date; a month needs a day beside it.
const DATE_PATTERN = new RegExp(
  `\\b(?:today|tonight|tomorrow|day after tomorrow|(?:mon|tues|wednes|thurs|fri|satur|sun)day|\\d{4}-\\d{2}-\\d{2}|the \\d{1,2}(?:st|nd|rd|th)|(?:${MONTH})\\.? (?:the )?(?:${DAY_OF_MONTH})|(?:${DAY_OF_MONTH}) (?:of )?(?:${MONTH}))\\b`
);
const TIME_PATTERN =
  /\b\d{1,2}(?:[:.]\d{2})? ?(?:am|pm|a\.m\.?|p\.m\.?)(?![a-z])|\b\d{1,2}:\d{2}\b|\b(?:noon|midday)\b/;
const EMAIL_PATTERN = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\bat [a-z0-9-]+ dot [a-z]{2,}\b/;
const SLOT_REFERENCE =
  /\b(?:option|slot|number) ?#?\d{1,2}\b|\bthe (?:\d{1,2}(?:[:.]\d{2})? ?(?:am|pm)?|first|second|third|fourth|fifth|sixth|last|earliest|latest) (?:one|option|slot)\b/;
const CONFIRMATION_REPLY =
  /^(?:yes|yeah|yep|yup|sure|ok|okay|confirm(?:ed)?|go ahead|please do|book it|sounds good|that works|works for me|perfect|correct|no|nope|not quite)\b/;
const NAME_INTRO = /\b(?:my name is|my name's|name:)/;
const CANCEL_PATTERN =
  /\b(?:cancel|never ?mind|forget (?:it|about it|that)|leave it|not now|maybe later|no thanks|stop|don't (?:want to )?(?:book|schedule))\b/;

const SCHEDULING_REQUESTS = [
  /\b(?:book|schedule|set up|setup|arrange|line up|organi[sz]e) (?:(?:a|an|the|some|another) )?(?:(?:quick|short|brief|\d+[ -]?min(?:ute)?s?) )?(?:call|meeting|interview|chat|slot|time|session)s?\b/,
  /\b\d+[ -]?min(?:ute)?s? (?:call|chat|meeting|interview|slot)\b/,
  /\b(?:quick|short|brief) (?:call|chat|meeting)\b/,
  /\b(?:have|do|get on|hop on|jump on) (?:a )?(?:quick )?(?:call|meeting|interview)\b/,
  /\b(?:can|could|shall|may) (?:we|i) (?:talk|speak|meet|connect)\b/,
  /\b(?:talk|speak|meet|chat|connect) (?:to|with) (?:him|shubham)\b/,
  /\b(?:meet|interview) (?:him|shubham)\b/,
  /\b(?:his|shubham's) (?:availability|calendar|schedule)\b/,
  /\b(?:available|open|free) (?:time )?slots?\b/,
  /\b(?:i'd like|i would like|i want|i'd love|let's|can i|could i|help me) (?:to )?(?:book|schedule)\b/,
  /\b(?:\d+|a few|few|five|ten|fifteen|twenty|thirty)[ -]?min(?:ute)?s? (?:with|of) (?:him|shubham|his time)\b/
];
const AVAILABILITY_QUESTION =
  /\b(?:(?:is|are) (?:he|shubham|you)|when (?:is|are|will|would|could) (?:he|shubham|you)(?: be)?) (?:free|available)\b/;
const AVAILABILITY_PURPOSE =
  /^ (?:for|to) (?:a |an )?(?:quick |short )?(?:call|chat|meeting|interview|talk|meet|speak)\b/;
const AVAILABILITY_PERIOD =
  /^ (?:(?:sometime |some time )?(?:later )?(?:this|next) (?:week|weekend)|sometime|some time|at some point|any ?time|soon)\b/;

const SCHEDULING_VOCABULARY =
  /\b(?:call|calls|meet|meeting|meetings|interview|interviews|available|availability|free|schedule|scheduling|calendar|slots?|book|booking|appointment|talk|speak|chat|mins?|minutes?)\b/;
const PROFILE_TOPIC =
  /\b(?:projects?|resume|cv|skills?|experience|github|linkedin|education|college|universit(?:y|ies)|degree|intern|internships?|tech stack|built|build|building|portfolio|background|studied|achievements?|hackathons?|frameworks?|programming|languages?|repos?|repositor(?:y|ies)|strengths?|worked|work on|working on|certifications?|tell me (?:more )?about|who is)\b/;
const FOLLOW_UP =
  /\b(?:there|that|those|these|this|it|its|they|them|their)\b|\bthe (?:tradeoffs?|project|app|repo|system|same|other|latter|former)\b|^(?:and|also|why|how so|what about|how about|more)\b/;

const STEP_CONTEXT: Record<SchedulingStep, string> = {
  idle: "no booking in progress",
  awaiting_day: "the assistant asked which day suits the visitor",
  awaiting_slot: "the assistant offered numbered time slots and is waiting for a pick",
  awaiting_details: "the assistant is waiting for the visitor's name and email",
  awaiting_confirmation: "the assistant asked the visitor to confirm the booking",
  booked: "a call was just booked; no booking in progress"
};

const ROUTER_INSTRUCTIONS = [
  "You route visitor messages for the assistant on Shubham's portfolio site. Visitors ask about Shubham's work or book a 15-minute call with him.",
  "Choose intent:",
  "- scheduling: the visitor wants to book a call, asks about his availability, or continues a booking (a day, a time, a slot choice, their name or email, yes/no to a confirmation).",
  "- cancel_scheduling: the visitor wants to stop the booking in progress.",
  "- profile: anything else, including questions about his projects, skills and experience.",
  "\"callback\", \"called\", \"meets the requirements\" and \"meeting deadlines\" are not booking requests.",
  "standaloneQuestion: for profile, rewrite the message as a self-contained question about Shubham, resolving references such as \"it\", \"there\" or \"that project\" from the recent turns; keep it as written when it already stands alone. For other intents, repeat the message."
].join("\n");

const routeSchema = z.object({
  intent: z.enum(["profile", "scheduling", "cancel_scheduling"]),
  standaloneQuestion: z.string()
});

function normalize(message: string) {
  return message.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
}

function isSchedulingActive(step: SchedulingStep) {
  return step !== "idle" && step !== "booked";
}

function hasDateOrTime(text: string) {
  return DATE_PATTERN.test(text) || TIME_PATTERN.test(text);
}

function asksForAvailability(text: string) {
  const match = AVAILABILITY_QUESTION.exec(text);
  if (!match) return false;

  const rest = text.slice(match.index + match[0].length).replace(AVAILABILITY_PERIOD, "");
  return /^[\s?.!]*$/.test(rest) || AVAILABILITY_PURPOSE.test(rest) || hasDateOrTime(rest);
}

function asksToSchedule(text: string) {
  return SCHEDULING_REQUESTS.some((pattern) => pattern.test(text)) || asksForAvailability(text);
}

function hasBookingDetails(text: string) {
  return (
    hasDateOrTime(text) ||
    EMAIL_PATTERN.test(text) ||
    SLOT_REFERENCE.test(text) ||
    CONFIRMATION_REPLY.test(text) ||
    NAME_INTRO.test(text)
  );
}

function isShortReply(text: string) {
  return !text.includes("?") && text.split(" ").length <= SHORT_REPLY_WORDS;
}

function decide(
  input: RouteInput,
  intent: RouteDecision["intent"],
  via: RouteDecision["via"]
): RouteDecision {
  return { intent, query: input.message, via };
}

function activeFastPath(input: RouteInput, text: string): RouteDecision | null {
  if (CANCEL_PATTERN.test(text)) return decide(input, "cancel_scheduling", "fast-path");

  const profile = PROFILE_TOPIC.test(text);
  if (asksToSchedule(text) || hasBookingDetails(text)) {
    return profile ? null : decide(input, "scheduling", "fast-path");
  }
  if (profile) {
    return input.history.length > 0 && FOLLOW_UP.test(text)
      ? null
      : decide(input, "profile", "fast-path");
  }
  return isShortReply(text) ? decide(input, "scheduling", "fast-path") : null;
}

export function fastPathRoute(input: RouteInput): RouteDecision | null {
  const text = normalize(input.message);
  if (isSchedulingActive(input.schedulingStep)) return activeFastPath(input, text);

  if (asksToSchedule(text)) {
    return PROFILE_TOPIC.test(text) ? null : decide(input, "scheduling", "fast-path");
  }
  if (input.history.length > 0 || SCHEDULING_VOCABULARY.test(text) || hasDateOrTime(text)) {
    return null;
  }
  return decide(input, "profile", "fast-path");
}

// Only reached when the fast path abstains. Mid-booking, anything that is not purely a
// profile question keeps the booking going.
function prefersScheduling(input: RouteInput, text: string) {
  if (asksToSchedule(text)) return true;

  const profile = PROFILE_TOPIC.test(text);
  if (isSchedulingActive(input.schedulingStep)) return hasBookingDetails(text) || !profile;
  return hasDateOrTime(text) && !profile;
}

function fallbackRoute(input: RouteInput): RouteDecision {
  const intent = prefersScheduling(input, normalize(input.message)) ? "scheduling" : "profile";
  return decide(input, intent, "fallback");
}

function clip(text: string) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > ASSISTANT_CONTEXT_CHARS
    ? `${flat.slice(0, ASSISTANT_CONTEXT_CHARS).trimEnd()}…`
    : flat;
}

function routerSystemPrompt(input: RouteInput) {
  const turns = input.history
    .slice(-ROUTER_HISTORY_TURNS)
    .flatMap((turn) => [
      `Visitor: ${turn.user}`,
      `Assistant: ${turn.assistant ? clip(turn.assistant) : "(no answer)"}`
    ]);

  return [
    ROUTER_INSTRUCTIONS,
    "",
    `Booking state: ${STEP_CONTEXT[input.schedulingStep]}.`,
    "",
    "Recent turns:",
    ...(turns.length > 0 ? turns : ["(none)"])
  ].join("\n");
}

export function createLlmClassifier(): Classifier | null {
  if (!hasChatProvider()) return null;

  return (input, signal) =>
    withChatProviderFallback(
      async (provider) => {
        const timeout = AbortSignal.timeout(ROUTER_TIMEOUT_MS);
        const completion = await provider.client.chat.completions.parse(
          {
            model: provider.router.id,
            ...reasoningParams(provider.router),
            temperature: 0,
            max_completion_tokens: provider.router.reasoningEffort
              ? REASONING_ROUTER_MAX_TOKENS
              : ROUTER_MAX_TOKENS,
            response_format: zodResponseFormat(routeSchema, "route"),
            messages: [
              { role: "system", content: routerSystemPrompt(input) },
              { role: "user", content: input.message }
            ]
          },
          { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, maxRetries: 0 }
        );

        const parsed = completion.choices[0]?.message.parsed;
        if (!parsed) throw new Error("Router returned no decision.");
        return parsed;
      },
      { signal }
    );
}

export async function routeMessage(
  input: RouteInput,
  {
    classify = createLlmClassifier(),
    signal
  }: { classify?: Classifier | null; signal?: AbortSignal } = {}
): Promise<RouteDecision> {
  const fast = fastPathRoute(input);
  if (fast) return fast;
  if (!classify) return fallbackRoute(input);

  try {
    const { intent, standaloneQuestion } = await classify(input, signal);
    // Scheduling parsers read the visitor's own words; only profile questions take the rewrite.
    const query = intent === "profile" ? standaloneQuestion.trim() || input.message : input.message;
    return { intent, query, via: "llm" };
  } catch (error) {
    if (!signal?.aborted) console.warn("Message routing fell back to heuristics.", error);
    return fallbackRoute(input);
  }
}
