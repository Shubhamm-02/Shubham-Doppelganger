import type { OfferedSlot } from "@/lib/chat/types";
import { BookingError, createBooking } from "@/lib/calendar/booking";
import { CALENDAR_TIME_ZONE, isCalendarConfigured } from "@/lib/calendar/config";
import { extractLatestEmail, extractName, normalizeEmailCandidate } from "@/lib/calendar/contacts";
import {
  dateKeyInZone,
  extractTargetDateKey,
  formatDateKey,
  formatTimeInZone
} from "@/lib/calendar/dates";
import { findSlots, selectSlot } from "@/lib/calendar/slots";
import { extractPreferredTimeWindow } from "@/lib/calendar/times";

type VoiceToolResult = {
  message: string;
  slots?: OfferedSlot[];
};

type VoiceCalendarInput = {
  name: string | null;
  email: string | null;
  emailConfirmed: boolean;
  selection: string;
  slotStart: string | null;
  dateKey: string | null;
  text: string;
};

const VOICE_SLOT_LIMIT = 3;
const CALENDAR_UNAVAILABLE_MESSAGE =
  "I could not check Shubham's calendar just now. Please try again in a moment, or share another day.";
const ASK_FOR_DAY_MESSAGE =
  "Which day should I check? You can say tomorrow, a weekday, or a date like October 17.";

function stringValue(input: Record<string, unknown>, key: string) {
  const value = input[key];
  return typeof value === "string" ? value.trim() : "";
}

function booleanValue(input: Record<string, unknown>, key: string) {
  const value = input[key];
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return /^(true|yes|confirmed)$/i.test(value.trim());
  return false;
}

function parseVoiceInput(input: Record<string, unknown>): VoiceCalendarInput {
  const preferredWindow =
    stringValue(input, "preferredWindow") ||
    stringValue(input, "window") ||
    stringValue(input, "timeWindow") ||
    stringValue(input, "message");
  const explicitEmail =
    normalizeEmailCandidate(stringValue(input, "email")) ||
    normalizeEmailCandidate(stringValue(input, "emailLocalPart")) ||
    normalizeEmailCandidate(stringValue(input, "emailUsername"));
  const text = [
    stringValue(input, "text"),
    stringValue(input, "message"),
    stringValue(input, "name"),
    stringValue(input, "email"),
    stringValue(input, "emailLocalPart"),
    stringValue(input, "emailUsername"),
    preferredWindow
  ]
    .filter(Boolean)
    .join("\n");
  const slotStart = stringValue(input, "slotStart") || stringValue(input, "start");

  return {
    name: stringValue(input, "name") || extractName(text),
    email: explicitEmail || extractLatestEmail(text),
    emailConfirmed:
      booleanValue(input, "emailConfirmed") || booleanValue(input, "confirmedEmail"),
    selection: stringValue(input, "selection"),
    slotStart: slotStart && !Number.isNaN(Date.parse(slotStart)) ? slotStart : null,
    dateKey: extractTargetDateKey(text, { now: new Date(), timeZone: CALENDAR_TIME_ZONE }),
    text
  };
}

function describeRequest(dateKey: string, text: string) {
  const timeText = extractPreferredTimeWindow(text)?.text.replace(/(am|pm)\b/g, (meridian) =>
    meridian.toUpperCase()
  );
  return [formatDateKey(dateKey), timeText].filter(Boolean).join(", ");
}

function optionsQuestion(count: number) {
  if (count === 1) return "Does option 1 work for you?";
  const leading = Array.from({ length: count - 1 }, (_, index) => index + 1).join(", ");
  return `Which option do you want: ${leading}${count > 2 ? "," : ""} or ${count}?`;
}

function slotsMessage(slots: OfferedSlot[], request: string) {
  if (!slots.length) {
    return `I checked Shubham's calendar for ${request}, but I could not find an open 15-minute slot. Please share another day.`;
  }

  const options = slots.map((slot, index) => `option ${index + 1}: ${slot.label}`).join("; ");
  const found =
    slots.length === 1
      ? "this available 15-minute interview slot"
      : "these available 15-minute interview slots";
  return `I found ${found} for ${request}: ${options}. ${optionsQuestion(slots.length)}`;
}

function missingDetails(input: VoiceCalendarInput) {
  const missing: string[] = [];
  if (!input.name) missing.push("name");
  if (!input.email) missing.push("email");
  if (input.email && !input.emailConfirmed) {
    missing.push(`confirmation that ${input.email} is the correct email`);
  }
  if (input.slotStart) return missing;
  if (!input.dateKey) missing.push("preferred day");
  if (!input.selection && !extractPreferredTimeWindow(input.text)) {
    missing.push("which proposed slot you want");
  }
  return missing;
}

function describeSlotStart(start: string) {
  const date = new Date(start);
  return `${formatDateKey(dateKeyInZone(date, CALENDAR_TIME_ZONE))} at ${formatTimeInZone(
    date,
    CALENDAR_TIME_ZONE
  )}`;
}

async function resolveSlotStart(input: VoiceCalendarInput) {
  if (input.slotStart) return input.slotStart;
  if (!input.dateKey) return null;

  const slots = await findSlots(input.dateKey, {
    preference: input.text,
    limit: VOICE_SLOT_LIMIT
  });
  return selectSlot(input.selection || input.text, slots)?.start ?? null;
}

export async function getAvailability(input: Record<string, unknown>): Promise<VoiceToolResult> {
  if (!isCalendarConfigured()) {
    return {
      message:
        "I can collect the interview details, but live calendar availability is not connected yet."
    };
  }

  const parsed = parseVoiceInput(input);
  if (!parsed.dateKey) return { message: ASK_FOR_DAY_MESSAGE };

  try {
    const slots = await findSlots(parsed.dateKey, {
      preference: parsed.text,
      limit: VOICE_SLOT_LIMIT
    });
    return { message: slotsMessage(slots, describeRequest(parsed.dateKey, parsed.text)), slots };
  } catch (error) {
    console.error("Cal.com availability lookup failed", error);
    return { message: CALENDAR_UNAVAILABLE_MESSAGE };
  }
}

export async function bookInterview(input: Record<string, unknown>): Promise<VoiceToolResult> {
  if (!isCalendarConfigured()) {
    return {
      message: "I can collect the interview details, but live calendar booking is not connected yet."
    };
  }

  const parsed = parseVoiceInput(input);
  const missing = missingDetails(parsed);
  if (!parsed.name || !parsed.email || missing.length) {
    return {
      message: `I still need ${missing.join(", ")} before I can book the interview.`
    };
  }

  let start: string | null;
  try {
    start = await resolveSlotStart(parsed);
  } catch (error) {
    console.error("Cal.com availability lookup failed", error);
    return { message: CALENDAR_UNAVAILABLE_MESSAGE };
  }
  if (!start) {
    return {
      message:
        "I could not find an available 15-minute slot at that time, so I did not create a booking. Please share another exact 15-minute time."
    };
  }

  try {
    const booking = await createBooking({ start, name: parsed.name, email: parsed.email });
    const meetingLine = booking.meetingUrl ? `\nMeeting link: ${booking.meetingUrl}` : "";
    return {
      message: `Booked. The interview is confirmed for ${describeSlotStart(
        booking.start
      )}. A calendar invite should be sent to ${booking.attendeeEmail}.${meetingLine}`
    };
  } catch (error) {
    if (error instanceof BookingError) return { message: error.userMessage };
    throw error;
  }
}
