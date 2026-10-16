export const IST_TIME_ZONE = "Asia/Kolkata";

export type SessionGroupLabel = "Today" | "Yesterday" | "Earlier";

const DAY_MS = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string, options: Intl.DateTimeFormatOptions) {
  const key = `${timeZone}|${JSON.stringify(options)}`;
  let cached = formatters.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
    formatters.set(key, cached);
  }
  return cached;
}

function normalizeSpaces(text: string) {
  return text.replace(/[  ]/g, " ");
}

export function formatLocalTime(iso: string, timeZone: string) {
  return normalizeSpaces(formatter(timeZone, { hour: "numeric", minute: "2-digit" }).format(new Date(iso)));
}

export function formatIstTime(iso: string) {
  return formatLocalTime(iso, IST_TIME_ZONE);
}

export function formatZoneName(iso: string, timeZone: string) {
  const parts = formatter(timeZone, { timeZoneName: "short" }).formatToParts(new Date(iso));
  return parts.find((part) => part.type === "timeZoneName")?.value ?? timeZone;
}

export function visitorTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function offsetMinutes(timeZone: string, at: Date) {
  const parts = formatter(timeZone, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23"
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"));
  return Math.round((asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000);
}

export function differsFromIst(timeZone: string, at: Date | string = new Date()) {
  const instant = typeof at === "string" ? new Date(at) : at;
  return offsetMinutes(timeZone, instant) !== offsetMinutes(IST_TIME_ZONE, instant);
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

export function formatDayHeader(dateKey: string) {
  return formatter("UTC", { weekday: "long", month: "short", day: "numeric" }).format(parseDateKey(dateKey));
}

export function istDateKey(at: Date | string = new Date()) {
  const instant = typeof at === "string" ? new Date(at) : at;
  const parts = formatter(IST_TIME_ZONE, { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function shiftDateKey(dateKey: string, days: number) {
  return new Date(parseDateKey(dateKey).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

export function sessionGroup(updatedAt: string | Date, now: Date = new Date()): SessionGroupLabel {
  const updated = typeof updatedAt === "string" ? new Date(updatedAt) : updatedAt;
  const today = startOfLocalDay(now);
  const day = startOfLocalDay(updated);
  if (day >= today) return "Today";
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1).getTime();
  return day >= yesterday ? "Yesterday" : "Earlier";
}

export function formatWait(seconds: number) {
  const total = Math.max(1, Math.ceil(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (!minutes) return `${rest}s`;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mmss = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}
