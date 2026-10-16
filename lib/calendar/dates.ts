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
const WEEKDAYS: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6
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

function alternation(words: string[]) {
  return [...words].sort((first, second) => second.length - first.length).join("|");
}

const MONTH = `(${alternation(Object.keys(MONTHS))})\\.?`;
const DAY = `(\\d{1,2}(?:st|nd|rd|th)?|${alternation(Object.keys(ORDINAL_DAYS))})`;
const YEAR = "(?:,?[ \\t]*(20\\d{2}))?";
const RELATIVE_PATTERN = /\b(day after (?:tomorrow|tmrw)|today|tomorrow|tmrw)\b/g;
const ISO_PATTERN = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g;
const MONTH_DAY_PATTERN = new RegExp(`\\b${MONTH}[ \\t]+(?:the[ \\t]+)?${DAY}\\b${YEAR}`, "g");
const DAY_MONTH_PATTERN = new RegExp(`\\b${DAY}(?:[ \\t]+of)?[ \\t]+${MONTH}(?![a-z])${YEAR}`, "g");
const WEEKDAY_PATTERN = new RegExp(`\\b(${alternation(Object.keys(WEEKDAYS))})\\b`, "g");

export function dateKeyInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function minutesInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value);
  return part("hour") * 60 + part("minute");
}

export function formatTimeInZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  })
    .format(date)
    .replace(/\s/g, " ");
}

export function addDays(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function formatDateKey(dateKey: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric"
  }).format(new Date(`${dateKey}T00:00:00.000Z`));
}

function validDateKey(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  const dateKey = date.toISOString().slice(0, 10);
  return dateKey === `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
    ? dateKey
    : null;
}

export function isValidDateKey(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return Boolean(match && validDateKey(Number(match[1]), Number(match[2]), Number(match[3])));
}

function parseDay(value: string) {
  const numeric = value.match(/^(\d{1,2})/);
  return numeric ? Number(numeric[1]) : ORDINAL_DAYS[value];
}

function resolveMonthDay(month: number, day: number, year: string | undefined, today: string) {
  if (year) return validDateKey(Number(year), month, day);

  const currentYear = Number(today.slice(0, 4));
  for (const candidateYear of [currentYear, currentYear + 1]) {
    const dateKey = validDateKey(candidateYear, month, day);
    if (dateKey && dateKey >= today) return dateKey;
  }
  return null;
}

function nextWeekday(today: string, weekday: number) {
  const currentWeekday = new Date(`${today}T00:00:00.000Z`).getUTCDay();
  return addDays(today, (weekday - currentWeekday + 7) % 7 || 7);
}

export function extractTargetDateKey(
  text: string,
  { now, timeZone }: { now: Date; timeZone: string }
) {
  const lower = text.toLowerCase().replace(/([a-z])-([a-z])/g, "$1 $2");
  const today = dateKeyInZone(now, timeZone);
  const candidates: Array<{ index: number; dateKey: string | null }> = [];

  for (const match of lower.matchAll(RELATIVE_PATTERN)) {
    const offset = match[1] === "today" ? 0 : match[1].startsWith("day after") ? 2 : 1;
    candidates.push({ index: match.index, dateKey: addDays(today, offset) });
  }

  for (const match of lower.matchAll(ISO_PATTERN)) {
    candidates.push({
      index: match.index,
      dateKey: validDateKey(Number(match[1]), Number(match[2]), Number(match[3]))
    });
  }

  for (const match of lower.matchAll(MONTH_DAY_PATTERN)) {
    candidates.push({
      index: match.index,
      dateKey: resolveMonthDay(MONTHS[match[1]], parseDay(match[2]), match[3], today)
    });
  }

  for (const match of lower.matchAll(DAY_MONTH_PATTERN)) {
    candidates.push({
      index: match.index,
      dateKey: resolveMonthDay(MONTHS[match[2]], parseDay(match[1]), match[3], today)
    });
  }

  for (const match of lower.matchAll(WEEKDAY_PATTERN)) {
    candidates.push({ index: match.index, dateKey: nextWeekday(today, WEEKDAYS[match[1]]) });
  }

  const latest = candidates
    .filter((candidate) => candidate.dateKey)
    .sort((first, second) => first.index - second.index)
    .at(-1);
  return latest?.dateKey ?? null;
}
