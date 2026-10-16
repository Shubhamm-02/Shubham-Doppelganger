import { useSyncExternalStore } from "react";
import {
  differsFromIst,
  formatIstTime,
  formatLocalTime,
  formatZoneName,
  IST_TIME_ZONE,
  istDateKey,
  visitorTimeZone
} from "@/lib/client/format-time";

const istDay = new Intl.DateTimeFormat("en-US", { timeZone: IST_TIME_ZONE, weekday: "short", month: "short", day: "numeric" });

function subscribeToNothing() {
  return () => {};
}

export function useVisitorTimeZone() {
  return useSyncExternalStore(subscribeToNothing, visitorTimeZone, () => IST_TIME_ZONE);
}

export function formatSlotDay(iso: string) {
  return istDay.format(new Date(iso));
}

export function formatSlotLabel(iso: string) {
  return `${formatSlotDay(iso)} at ${formatIstTime(iso)} IST`;
}

function localDateKey(iso: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

type LocalTime = { time: string; zone: string; weekday: string | null };

export function localTimeFor(iso: string, timeZone: string): LocalTime | null {
  if (!differsFromIst(timeZone, iso)) return null;
  const sameDay = localDateKey(iso, timeZone) === istDateKey(iso);
  return {
    time: formatLocalTime(iso, timeZone),
    zone: formatZoneName(iso, timeZone),
    weekday: sameDay ? null : new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(new Date(iso))
  };
}

export function formatLocalTimeLabel(local: LocalTime) {
  return `${local.weekday ? `${local.weekday} ` : ""}${local.time} ${local.zone}`;
}
