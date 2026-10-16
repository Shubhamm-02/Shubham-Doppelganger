export type TimeWindow = {
  startMinutes: number;
  endMinutes: number;
  exact: boolean;
  text: string;
};

const END_OF_DAY = 24 * 60;
const DAY_PARTS: Record<string, [number, number]> = {
  morning: [9 * 60, 12 * 60],
  afternoon: [12 * 60, 17 * 60],
  evening: [17 * 60, 21 * 60]
};
const NOT_AFTER_NUMBER = "(?<![\\d:./-])";
const TIME = "(\\d{1,2})(?:[:.](\\d{2}))?(?:\\s*(am|pm)\\b)?";
const RANGE_PATTERN = new RegExp(
  `${NOT_AFTER_NUMBER}${TIME}\\s*(?:-|–|—|to|till|until)\\s*${TIME}(?![\\d:])`
);
const BOUND_PATTERN = new RegExp(`\\b(after|before|from)\\s+${TIME}(?![\\d:])`);
const MERIDIAN_PATTERN = /(?<![\d:./-])(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)\b/;
const CLOCK_PATTERN = /(?<![\d:./-])(\d{1,2})[:.](\d{2})(?![\d:])/;
const AT_PATTERN = /\bat\s+(\d{1,2})\b(?![:.]\d)/;
const DAY_PART_PATTERN = /\b(morning|afternoon|evening)\b/;

export function normalizeTimeText(text: string) {
  return text
    .toLowerCase()
    .replace(/\b([ap])\.\s?m\.?/g, "$1m")
    .replace(/\bnoon\b/g, "12 pm");
}

// Without am/pm, 1-7 is read as afternoon: interviews happen in working hours.
export function toMinutes(hourValue: string, minuteValue = "0", meridian?: string) {
  let hour = Number(hourValue);
  const minute = Number(minuteValue);

  if (meridian === "pm" && hour < 12) hour += 12;
  if (meridian === "am" && hour === 12) hour = 0;
  if (!meridian && hour >= 1 && hour <= 7) hour += 12;

  return hour * 60 + minute;
}

function otherMeridian(meridian: string) {
  return meridian === "pm" ? "am" : "pm";
}

function rangeWindow(match: RegExpMatchArray): TimeWindow {
  const [text, startHour, startMinute, startMeridian, endHour, endMinute, endMeridian] = match;
  let startMinutes = toMinutes(startHour, startMinute, startMeridian ?? endMeridian);
  let endMinutes = toMinutes(endHour, endMinute, endMeridian ?? startMeridian);

  if (endMinutes <= startMinutes && !startMeridian && endMeridian) {
    startMinutes = toMinutes(startHour, startMinute, otherMeridian(endMeridian));
  } else if (endMinutes <= startMinutes && startMeridian && !endMeridian) {
    endMinutes = toMinutes(endHour, endMinute, otherMeridian(startMeridian));
  }

  return { startMinutes, endMinutes, exact: false, text: text.trim() };
}

export function extractPreferredTimeWindow(text: string): TimeWindow | null {
  const normalized = normalizeTimeText(text);

  const range = normalized.match(RANGE_PATTERN);
  if (range) return rangeWindow(range);

  const bound = normalized.match(BOUND_PATTERN);
  if (bound) {
    const [boundText, direction, hour, minute, meridian] = bound;
    const minutes = toMinutes(hour, minute, meridian);
    return direction === "before"
      ? { startMinutes: 0, endMinutes: minutes, exact: false, text: boundText }
      : { startMinutes: minutes, endMinutes: END_OF_DAY, exact: false, text: boundText };
  }

  const exact =
    normalized.match(MERIDIAN_PATTERN) ??
    normalized.match(CLOCK_PATTERN) ??
    normalized.match(AT_PATTERN);
  if (exact) {
    const [exactText, hour, minute, meridian] = exact;
    const minutes = toMinutes(hour, minute, meridian);
    return { startMinutes: minutes, endMinutes: minutes + 1, exact: true, text: exactText };
  }

  const dayPart = normalized.match(DAY_PART_PATTERN);
  if (dayPart) {
    const [startMinutes, endMinutes] = DAY_PARTS[dayPart[1]];
    return { startMinutes, endMinutes, exact: false, text: dayPart[1] };
  }

  return null;
}
