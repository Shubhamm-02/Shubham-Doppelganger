import { findKnownCallerName } from "@/lib/scheduling-names";

type CalendarSlot = {
  start: string;
  end?: string;
  label: string;
};

type CalendarResult = {
  configured: boolean;
  message: string;
  slots?: CalendarSlot[];
  booking?: {
    uid?: string;
    start?: string;
    end?: string;
    meetingUrl?: string;
  };
};

type ParsedCalendarInput = {
  name?: string;
  email?: string;
  emailConfirmed: boolean;
  preferredWindow?: string;
  selection?: string;
  slotStart?: string;
  text: string;
};

type CalSlotsResponse = {
  status: string;
  data?: Record<string, Array<string | { start: string; end?: string }>>;
  error?: unknown;
};

type CalBookingResponse = {
  status: string;
  data?: {
    uid?: string;
    start?: string;
    end?: string;
    meetingUrl?: string;
    location?: string;
  };
  error?: unknown;
};

const CAL_API_BASE_URL = "https://api.cal.com/v2";
const DEFAULT_CAL_BOOKING_API_VERSION = "2026-02-25";
const DEFAULT_CAL_SLOTS_API_VERSION = "2024-09-04";
const DEFAULT_TIMEZONE = "Asia/Kolkata";
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const WEEKDAYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday"
];
const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};
const ORDINAL_DAYS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  "twenty first": 21,
  "twenty second": 22,
  "twenty third": 23,
  "twenty fourth": 24,
  "twenty fifth": 25,
  "twenty sixth": 26,
  "twenty seventh": 27,
  "twenty eighth": 28,
  "twenty ninth": 29,
  thirtieth: 30,
  "thirty first": 31
};
const MONTH_NAME_PATTERN = Object.keys(MONTHS)
  .sort((first, second) => second.length - first.length)
  .join("|");
const ORDINAL_DAY_PATTERN = Object.keys(ORDINAL_DAYS)
  .sort((first, second) => second.length - first.length)
  .join("|");
const DAY_VALUE_PATTERN = `(?:\\d{1,2}(?:st|nd|rd|th)?|${ORDINAL_DAY_PATTERN})`;

function isCalendarConfigured() {
  return Boolean(process.env.CAL_API_KEY && process.env.CAL_EVENT_TYPE_ID);
}

function calendarConfigMessage(kind: "availability" | "booking") {
  return kind === "availability"
    ? "I can collect the interview details, but live calendar availability is not connected yet."
    : "I can collect the interview details, but live calendar booking is not connected yet.";
}

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

function parseCalendarInput(input: Record<string, unknown>): ParsedCalendarInput {
  const preferredWindow =
    stringValue(input, "preferredWindow") ||
    stringValue(input, "window") ||
    stringValue(input, "timeWindow") ||
    stringValue(input, "message");
  const text = [
    stringValue(input, "text"),
    stringValue(input, "message"),
    stringValue(input, "name"),
    stringValue(input, "email"),
    preferredWindow
  ]
    .filter(Boolean)
    .join("\n");

  return {
    name: stringValue(input, "name") || extractName(text),
    email: stringValue(input, "email") || text.match(EMAIL_PATTERN)?.[0],
    emailConfirmed:
      booleanValue(input, "emailConfirmed") ||
      booleanValue(input, "confirmedEmail"),
    preferredWindow,
    selection: stringValue(input, "selection"),
    slotStart: stringValue(input, "slotStart") || stringValue(input, "start"),
    text
  };
}

function extractName(text: string) {
  const explicit =
    text.match(/\bname\s*(?:is|:|-)\s*([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i)?.[1] ||
    text.match(/\bi am\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i)?.[1] ||
    text.match(/\bthis is\s+([A-Z][A-Za-z.'-]*(?:\s+[A-Z][A-Za-z.'-]*){0,3})/i)?.[1];

  if (explicit) return cleanName(explicit);
  const knownName = text
    .split(/\n+/)
    .map((line) => findKnownCallerName(cleanName(line)))
    .find(Boolean);
  if (knownName) return knownName;

  return undefined;
}

function cleanName(name: string) {
  return name
    .replace(/\b(email|timezone|ist|utc|gmt|tomorrow|today|at|on)\b.*$/i, "")
    .trim();
}

function getEventTypeId() {
  const eventTypeId = Number(process.env.CAL_EVENT_TYPE_ID);
  return Number.isFinite(eventTypeId) ? eventTypeId : undefined;
}

function getCalHeaders(includeJson = false, apiVersion?: string) {
  return {
    Authorization: `Bearer ${process.env.CAL_API_KEY}`,
    "cal-api-version":
      apiVersion ||
      process.env.CAL_API_VERSION ||
      DEFAULT_CAL_BOOKING_API_VERSION,
    ...(includeJson ? { "Content-Type": "application/json" } : {})
  };
}

async function calFetch<T>(
  path: string,
  init?: RequestInit & { calApiVersion?: string }
): Promise<T> {
  const { calApiVersion, ...fetchInit } = init ?? {};
  const response = await fetch(`${CAL_API_BASE_URL}${path}`, {
    ...fetchInit,
    headers: {
      ...getCalHeaders(fetchInit.method === "POST", calApiVersion),
      ...(fetchInit.headers ?? {})
    }
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(
      `Cal.com request failed (${response.status}): ${extractCalError(payload)}`
    );
  }

  return payload as T;
}

function extractCalError(payload: unknown) {
  if (!payload || typeof payload !== "object") return "unknown error";
  const record = payload as Record<string, unknown>;
  const error = record.error;
  const details =
    error && typeof error === "object"
      ? (error as Record<string, unknown>).details
      : undefined;
  const nestedMessage =
    error && typeof error === "object"
      ? (error as Record<string, unknown>).message
      : undefined;
  const detailMessage =
    details && typeof details === "object"
      ? (details as Record<string, unknown>).message
      : undefined;
  const message = record.message || nestedMessage || detailMessage || record.error;
  if (typeof message === "string") return message;
  return JSON.stringify(payload).slice(0, 500);
}

function dateKeyForTimeZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function currentYearInTimeZone(timezone: string) {
  return Number(dateKeyForTimeZone(new Date(), timezone).slice(0, 4));
}

function parseDayValue(value: string) {
  const normalized = value
    .toLowerCase()
    .replace(/-/g, " ")
    .replace(/\b(of|the)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const numeric = normalized.match(/^(\d{1,2})(?:st|nd|rd|th)?$/);
  const day = numeric ? Number(numeric[1]) : ORDINAL_DAYS[normalized];

  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : undefined;
}

function dateKeyFromMonthDay(
  monthName: string,
  dayValue: string,
  year: string | undefined,
  timezone: string
) {
  const month = MONTHS[monthName.toLowerCase()];
  const day = parseDayValue(dayValue);
  if (!month || !day) return undefined;

  return `${year ?? currentYearInTimeZone(timezone)}-${String(month).padStart(
    2,
    "0"
  )}-${String(day).padStart(2, "0")}`;
}

function extractTargetDateKey(text: string, timezone: string) {
  const lower = text.toLowerCase();
  const today = dateKeyForTimeZone(new Date(), timezone);

  if (/\b(day after tomorrow|day after tmrw)\b/i.test(text)) return addDays(today, 2);
  if (/\btoday\b/i.test(text)) return today;
  if (/\btomorrow\b/i.test(text)) return addDays(today, 1);

  const isoDate = lower.match(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
  }

  const monthDate = lower.match(
    new RegExp(
      `\\b(${MONTH_NAME_PATTERN})\\s+(${DAY_VALUE_PATTERN})(?:,?\\s*(20\\d{2}))?\\b`,
      "i"
    )
  );
  if (monthDate) {
    const [, monthName, day, year] = monthDate;
    return dateKeyFromMonthDay(monthName, day, year, timezone);
  }

  const dayMonthDate = lower.match(
    new RegExp(
      `\\b(${DAY_VALUE_PATTERN})(?:\\s+of)?\\s+(${MONTH_NAME_PATTERN})(?:,?\\s*(20\\d{2}))?\\b`,
      "i"
    )
  );
  if (dayMonthDate) {
    const [, day, monthName, year] = dayMonthDate;
    return dateKeyFromMonthDay(monthName, day, year, timezone);
  }

  const weekday = WEEKDAYS.find((day) => lower.includes(day.slice(0, 3)));
  if (weekday) {
    const targetDay = WEEKDAYS.indexOf(weekday);
    const currentDay = new Date(`${today}T00:00:00.000Z`).getUTCDay();
    const daysUntil = (targetDay - currentDay + 7) % 7 || 7;
    return addDays(today, daysUntil);
  }

  return undefined;
}

function toMinutes(hourValue: string, minuteValue = "0", meridian?: string) {
  let hour = Number(hourValue);
  const minute = Number(minuteValue);
  const normalizedMeridian = meridian?.toLowerCase();

  if (normalizedMeridian === "pm" && hour < 12) hour += 12;
  if (normalizedMeridian === "am" && hour === 12) hour = 0;

  return hour * 60 + minute;
}

function extractPreferredTimeWindow(text: string) {
  const range = text.match(
    /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*(?:-|to|–|—)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/i
  );

  if (range) {
    const [, startHour, startMinute = "0", startMeridian, endHour, endMinute = "0", endMeridian] =
      range;
    const inferredStartMeridian = startMeridian || endMeridian;
    return {
      startMinutes: toMinutes(startHour, startMinute, inferredStartMeridian),
      endMinutes: toMinutes(endHour, endMinute, endMeridian || startMeridian),
      exact: false
    };
  }

  const exact = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (exact) {
    const [, hour, minute = "0", meridian] = exact;
    const minutes = toMinutes(hour, minute, meridian);
    return {
      startMinutes: minutes,
      endMinutes: minutes + 1,
      exact: true
    };
  }

  return undefined;
}

function extractPreferredTimeText(text: string) {
  return (
    text.match(
      /\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*(?:-|to|–|—)\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b/i
    )?.[0] || text.match(/\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i)?.[0]
  );
}

function localSlotInfo(slotStart: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(slotStart));
  const part = (type: string) => parts.find((item) => item.type === type)?.value;

  return {
    dateKey: `${part("year")}-${part("month")}-${part("day")}`,
    minutes: Number(part("hour")) * 60 + Number(part("minute"))
  };
}

function formatSlotLabel(slotStart: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(new Date(slotStart));
}

function slotMatchesPreference(
  slot: CalendarSlot,
  text: string,
  timezone: string,
  targetDateKey?: string
) {
  const slotInfo = localSlotInfo(slot.start, timezone);
  if (targetDateKey && slotInfo.dateKey !== targetDateKey) return false;

  const preferredTime = extractPreferredTimeWindow(text);
  if (!preferredTime) return true;

  if (preferredTime.exact) {
    return Math.abs(slotInfo.minutes - preferredTime.startMinutes) <= 15;
  }

  return (
    slotInfo.minutes >= preferredTime.startMinutes &&
    slotInfo.minutes < preferredTime.endMinutes
  );
}

function flattenSlots(data: CalSlotsResponse["data"], timezone: string) {
  if (!data) return [];

  return Object.values(data)
    .flatMap((items) =>
      items.map((item) => {
        const start = typeof item === "string" ? item : item.start;
        const end = typeof item === "string" ? undefined : item.end;
        return {
          start,
          end,
          label: formatSlotLabel(start, timezone)
        };
      })
    )
    .sort((first, second) => first.start.localeCompare(second.start));
}

function chooseDisplaySlots(
  slots: CalendarSlot[],
  parsed: ParsedCalendarInput,
  timezone: string,
  targetDateKey?: string
) {
  const text = `${parsed.text}\n${parsed.preferredWindow ?? ""}`;
  const matching = slots.filter((slot) =>
    slotMatchesPreference(slot, text, timezone, targetDateKey)
  );

  if (matching.length) return matching.slice(0, 3);

  if (targetDateKey) {
    const sameDay = slots.filter(
      (slot) => localSlotInfo(slot.start, timezone).dateKey === targetDateKey
    );
    if (sameDay.length) return sameDay.slice(0, 3);
  }

  return slots.slice(0, 3);
}

function extractSlotSelection(input: Record<string, unknown>) {
  const selection = stringValue(input, "selection").toLowerCase();
  const text = selection || stringValue(input, "text").toLowerCase();

  if (/^\s*1\s*$|\b(first|slot\s*1)\b/i.test(text)) return 0;
  if (/^\s*2\s*$|\b(second|slot\s*2)\b/i.test(text)) return 1;
  if (/^\s*3\s*$|\b(third|slot\s*3)\b/i.test(text)) return 2;
  return 0;
}

function hasSlotSelectionText(text: string) {
  return /^\s*[1-3]\s*$|\b(first|second|third|slot\s*[1-3]|book\s+(the\s+)?(first|second|third))\b/i.test(
    text
  );
}

function formatSlotsMessage(slots: CalendarSlot[], preferredWindow: string) {
  if (!slots.length) {
    return `I checked Shubham's calendar for ${preferredWindow}, but I could not find an open 15-minute slot. Please share another day.`;
  }

  const formatted = slots
    .map((slot, index) => `${index + 1}. ${slot.label}`)
    .join("\n");

  return `I found these available 15-minute interview slots for ${preferredWindow}:\n\n${formatted}\n\nReply with 1, 2, or 3.`;
}

function formatDateKey(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function describePreferredWindow(parsed: ParsedCalendarInput, timezone: string) {
  const text = `${parsed.text}\n${parsed.preferredWindow ?? ""}`;
  const dateKey = extractTargetDateKey(text, timezone);
  const timeText = extractPreferredTimeText(text);
  const parts = [
    dateKey ? formatDateKey(dateKey) : null,
    timeText?.toUpperCase()
  ].filter(Boolean);

  return parts.length ? parts.join(", ") : "the requested day";
}

async function fetchSlots(parsed: ParsedCalendarInput) {
  const eventTypeId = getEventTypeId();
  const timezone = DEFAULT_TIMEZONE;
  const targetDateKey = extractTargetDateKey(
    `${parsed.text}\n${parsed.preferredWindow ?? ""}`,
    timezone
  );
  const start = targetDateKey || dateKeyForTimeZone(new Date(), timezone);
  const end = targetDateKey ? addDays(targetDateKey, 1) : addDays(start, 7);

  if (!eventTypeId) {
    throw new Error("CAL_EVENT_TYPE_ID must be numeric.");
  }

  const params = new URLSearchParams({
    eventTypeId: String(eventTypeId),
    start,
    end,
    timeZone: timezone,
    format: "range"
  });

  const response = await calFetch<CalSlotsResponse>(`/slots?${params.toString()}`, {
    calApiVersion:
      process.env.CAL_SLOTS_API_VERSION || DEFAULT_CAL_SLOTS_API_VERSION
  });
  const slots = flattenSlots(response.data, timezone);

  return {
    timezone,
    targetDateKey,
    slots,
    displaySlots: chooseDisplaySlots(slots, parsed, timezone, targetDateKey)
  };
}

function missingBookingFields(parsed: ParsedCalendarInput) {
  const missing: string[] = [];
  if (!parsed.name) missing.push("name");
  if (!parsed.email) missing.push("email");
  if (parsed.email && !parsed.emailConfirmed) {
    missing.push(`confirmation that ${parsed.email} is the correct email`);
  }
  if (parsed.slotStart && !Number.isNaN(Date.parse(parsed.slotStart))) {
    return missing;
  }
  if (
    !parsed.preferredWindow &&
    !extractTargetDateKey(parsed.text, DEFAULT_TIMEZONE)
  ) {
    missing.push("preferred day");
  }
  const selectionText = `${parsed.selection ?? ""}\n${parsed.text}\n${parsed.preferredWindow ?? ""}`;
  if (
    !parsed.slotStart &&
    !hasSlotSelectionText(selectionText) &&
    !extractPreferredTimeWindow(selectionText)
  ) {
    missing.push("which proposed slot you want");
  }
  return missing;
}

export async function getAvailability(
  input: Record<string, unknown>
): Promise<CalendarResult> {
  if (!isCalendarConfigured()) {
    return {
      configured: false,
      message: calendarConfigMessage("availability")
    };
  }

  const parsed = parseCalendarInput(input);

  try {
    const { displaySlots, timezone } = await fetchSlots(parsed);
    return {
      configured: true,
      message: formatSlotsMessage(
        displaySlots,
        describePreferredWindow(parsed, timezone)
      ),
      slots: displaySlots
    };
  } catch (error) {
    console.error("Cal.com availability lookup failed", error);
    return {
      configured: true,
      message:
        "I could not check Shubham's calendar just now. Please try again in a moment, or share another day."
    };
  }
}

export async function bookInterview(
  input: Record<string, unknown>
): Promise<CalendarResult> {
  if (!isCalendarConfigured()) {
    return {
      configured: false,
      message: calendarConfigMessage("booking")
    };
  }

  const parsed = parseCalendarInput(input);
  const missing = missingBookingFields(parsed);

  if (missing.length) {
    return {
      configured: true,
      message: `I still need ${missing.join(", ")} before I can book the interview.`
    };
  }

  const eventTypeId = getEventTypeId();
  if (!eventTypeId) {
    return {
      configured: true,
      message: "CAL_EVENT_TYPE_ID must be numeric before I can book the interview."
    };
  }

  try {
    const timezone = DEFAULT_TIMEZONE;
    let selectedSlot: CalendarSlot | undefined;

    if (parsed.slotStart && !Number.isNaN(Date.parse(parsed.slotStart))) {
      selectedSlot = {
        start: new Date(parsed.slotStart).toISOString(),
        label: formatSlotLabel(parsed.slotStart, timezone)
      };
    } else {
      const { displaySlots } = await fetchSlots(parsed);
      selectedSlot = displaySlots[extractSlotSelection(input)] || displaySlots[0];
    }

    if (!selectedSlot) {
      return {
        configured: true,
        message:
          "I could not find an available 15-minute slot at that time, so I did not create a booking. Please share another exact 15-minute time."
      };
    }

    const response = await calFetch<CalBookingResponse>("/bookings", {
      method: "POST",
      body: JSON.stringify({
        start: new Date(selectedSlot.start).toISOString(),
        eventTypeId,
        lengthInMinutes: 15,
        attendee: {
          name: parsed.name,
          email: parsed.email,
          timeZone: timezone,
          language: "en"
        },
        bookingFieldsResponses: {
          title: `Interview with ${parsed.name}`,
          notes: "Booked by Wizard, Shubham Shah's AI representative."
        },
        metadata: {
          source: "shubham-ai-representative",
          preferredWindow: parsed.preferredWindow || parsed.text.slice(0, 300)
        }
      })
    });

    const booking = response.data;
    const meetingUrl = booking?.meetingUrl || booking?.location;
    const meetingLine = meetingUrl ? `\nMeeting link: ${meetingUrl}` : "";

    return {
      configured: true,
      message: `Booked. The interview is confirmed for ${formatSlotLabel(
        booking?.start || selectedSlot.start,
        timezone
      )}. A calendar invite should be sent to ${parsed.email}.${meetingLine}`,
      booking: {
        uid: booking?.uid,
        start: booking?.start ?? selectedSlot.start,
        end: booking?.end,
        meetingUrl
      }
    };
  } catch (error) {
    console.error("Cal.com booking failed", error);
    return {
      configured: true,
      message:
        "I could not book the interview just now. Please try again in a moment, or choose another proposed slot."
    };
  }
}
