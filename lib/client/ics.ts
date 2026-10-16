import type { BookingConfirmation } from "@/lib/chat/types";

export const ICS_FILE_NAME = "interview-with-shubham-shah.ics";

const SUMMARY = "Interview with Shubham Shah";
const MAX_LINE_OCTETS = 75;
const encoder = new TextEncoder();

function utcStamp(iso: string | Date) {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function escapeText(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function foldLine(line: string) {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? MAX_LINE_OCTETS : MAX_LINE_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

function uidFor(booking: BookingConfirmation) {
  return `${booking.uid ?? `interview-${utcStamp(booking.start)}`}@shubham-shah`;
}

function describe(booking: BookingConfirmation) {
  const lines = [`15-minute call with Shubham Shah, booked by ${booking.attendeeName} (${booking.attendeeEmail}).`];
  if (booking.meetingUrl) lines.push(`Join: ${booking.meetingUrl}`);
  return lines.join("\n");
}

export function bookingToIcs(booking: BookingConfirmation, stamp: Date) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Shubham Shah//Interview booking//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${escapeText(uidFor(booking))}`,
    `DTSTAMP:${utcStamp(stamp)}`,
    `DTSTART:${utcStamp(booking.start)}`,
    `DTEND:${utcStamp(booking.end)}`,
    `SUMMARY:${escapeText(SUMMARY)}`,
    `DESCRIPTION:${escapeText(describe(booking))}`
  ];
  if (booking.meetingUrl) {
    lines.push(`LOCATION:${escapeText(booking.meetingUrl)}`, `URL:${booking.meetingUrl}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

export function icsDataUrl(ics: string) {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
