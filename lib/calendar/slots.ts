import type { OfferedSlot } from "@/lib/chat/types";
import { BookingError } from "@/lib/calendar/booking";
import { calFetch } from "@/lib/calendar/client";
import { CALENDAR_TIME_ZONE, eventTypeId, isCalendarConfigured } from "@/lib/calendar/config";
import {
  addDays,
  dateKeyInZone,
  formatTimeInZone,
  minutesInZone
} from "@/lib/calendar/dates";
import {
  extractPreferredTimeWindow,
  normalizeTimeText,
  toMinutes,
  type TimeWindow
} from "@/lib/calendar/times";

type CalSlot = string | { start: string; end?: string };

type CalSlotsResponse = {
  data?: Record<string, CalSlot[]>;
};

type MentionedTime = { minutes: number; twelveHour: boolean };

const DEFAULT_LIMIT = 6;
const EXACT_TOLERANCE_MINUTES = 15;
const POSITION_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6
};
const BARE_NUMBER_PATTERN = /^#?\s*(\d{1,2})$/;
const BARE_WORD_PATTERN =
  /^(?:the\s+)?(one|two|three|four|five|six|first|second|third|fourth|fifth|sixth|last)(?:\s+one)?$/;
const LABELLED_POSITION_PATTERN =
  /(?:\b(?:option|slot|number|choice|no\.)\s*|#\s*)(\d{1,2}|one|two|three|four|five|six)\b/g;
const PICK_NUMBER_PATTERN =
  /\b(?:take|pick|choose|book|do|want|prefer|go with)\s+(?:the\s+)?(\d{1,2})\b(?![:.]\d|\s*(?:am|pm|st|nd|rd|th)\b)/g;
const ORDINAL = "(first|second|third|fourth|fifth|sixth|last|1st|2nd|3rd|4th|5th|6th)";
const ORDINAL_PATTERN = new RegExp(
  `\\b${ORDINAL}(?=\\s+(?:one|slot|option|time)\\b)|\\bthe\\s+${ORDINAL}\\b(?!\\s+of\\b)`,
  "g"
);
const TRAILING_FILLER_PATTERN =
  /\s+(?:please|pls|thanks|thank you|works(?: for me)?|is (?:fine|good|great|perfect)|sounds good)$/;
const MERIDIAN_TIME_PATTERN = /(?<![\d:./-])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/g;
const CLOCK_TIME_PATTERN = /(?<![\d:./-])(\d{1,2})[:.](\d{2})(?![\d:]|\s*(?:am|pm)\b)/g;
const AT_HOUR_PATTERN = /\bat\s+(\d{1,2})\b(?![:.]\d|\s*(?:am|pm)\b)/g;

export function slotIdFor(start: string) {
  return `s${Math.floor(Date.parse(start) / 60_000).toString(36)}`;
}

function toOfferedSlot(item: CalSlot): OfferedSlot[] {
  const start = typeof item === "string" ? item : item.start;
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) return [];

  return [
    {
      id: slotIdFor(start),
      start,
      end: typeof item === "string" ? null : item.end ?? null,
      label: formatTimeInZone(date, CALENDAR_TIME_ZONE)
    }
  ];
}

function slotMinutes(slot: OfferedSlot) {
  return minutesInZone(new Date(slot.start), CALENDAR_TIME_ZONE);
}

function matchesWindow(slot: OfferedSlot, window: TimeWindow) {
  const minutes = slotMinutes(slot);
  return window.exact
    ? Math.abs(minutes - window.startMinutes) <= EXACT_TOLERANCE_MINUTES
    : minutes >= window.startMinutes && minutes < window.endMinutes;
}

export async function findSlots(
  dateKey: string,
  options: { preference?: string; limit?: number } = {}
): Promise<OfferedSlot[]> {
  const typeId = eventTypeId();
  if (!typeId || !isCalendarConfigured()) throw new BookingError("not_configured");

  const params = new URLSearchParams({
    eventTypeId: String(typeId),
    start: dateKey,
    end: addDays(dateKey, 1),
    timeZone: CALENDAR_TIME_ZONE,
    format: "range"
  });
  const response = await calFetch<CalSlotsResponse>(`/slots?${params.toString()}`, {
    endpoint: "slots"
  });
  const slots = Object.values(response.data ?? {})
    .flat()
    .flatMap(toOfferedSlot)
    .filter((slot) => dateKeyInZone(new Date(slot.start), CALENDAR_TIME_ZONE) === dateKey)
    .sort((first, second) => Date.parse(first.start) - Date.parse(second.start));

  const window = options.preference ? extractPreferredTimeWindow(options.preference) : null;
  const preferred = window ? slots.filter((slot) => matchesWindow(slot, window)) : [];
  return (preferred.length ? preferred : slots).slice(0, options.limit ?? DEFAULT_LIMIT);
}

function positionOf(value: string, count: number) {
  if (value === "last") return count;
  return POSITION_WORDS[value] ?? Number.parseInt(value, 10);
}

function mentionedPositions(text: string, count: number) {
  const bareNumber = text.match(BARE_NUMBER_PATTERN)?.[1];
  const bareWord = text.match(BARE_WORD_PATTERN)?.[1];
  const values = [
    ...(bareNumber && Number(bareNumber) <= count ? [bareNumber] : []),
    ...(bareWord ? [bareWord] : []),
    ...[...text.matchAll(LABELLED_POSITION_PATTERN)].map((match) => match[1]),
    ...[...text.matchAll(PICK_NUMBER_PATTERN)].map((match) => match[1]),
    ...[...text.matchAll(ORDINAL_PATTERN)].map((match) => match[1] ?? match[2])
  ];
  return values.map((value) => positionOf(value.replace(/^(\d+)(?:st|nd|rd|th)$/, "$1"), count));
}

function mentionedTimes(text: string, count: number): MentionedTime[] {
  const bareNumber = text.match(BARE_NUMBER_PATTERN)?.[1];
  return [
    ...[...text.matchAll(MERIDIAN_TIME_PATTERN)].map(([, hour, minute, meridian]) => ({
      minutes: toMinutes(hour, minute, meridian),
      twelveHour: false
    })),
    ...[...text.matchAll(CLOCK_TIME_PATTERN)].map(([, hour, minute]) => ({
      minutes: Number(hour) * 60 + Number(minute),
      twelveHour: Number(hour) <= 12
    })),
    ...[...text.matchAll(AT_HOUR_PATTERN)].map(([, hour]) => ({
      minutes: Number(hour) * 60,
      twelveHour: Number(hour) <= 12
    })),
    ...(bareNumber && Number(bareNumber) > count && Number(bareNumber) <= 12
      ? [{ minutes: Number(bareNumber) * 60, twelveHour: true }]
      : [])
  ];
}

function matchesTime(slot: OfferedSlot, time: MentionedTime) {
  const minutes = slotMinutes(slot);
  return time.twelveHour ? minutes % 720 === time.minutes % 720 : minutes === time.minutes;
}

export function selectSlot(text: string, slots: OfferedSlot[]) {
  const normalized = normalizeTimeText(text)
    .replace(/[!?,]+/g, " ")
    .replace(/\.+$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(TRAILING_FILLER_PATTERN, "");
  const picks = new Set<OfferedSlot>();

  for (const position of mentionedPositions(normalized, slots.length)) {
    const slot = slots[position - 1];
    if (slot) picks.add(slot);
  }
  for (const time of mentionedTimes(normalized, slots.length)) {
    for (const slot of slots) {
      if (matchesTime(slot, time)) picks.add(slot);
    }
  }

  return picks.size === 1 ? [...picks][0] : undefined;
}
