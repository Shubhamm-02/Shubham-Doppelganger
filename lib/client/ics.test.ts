import { describe, expect, it } from "vitest";
import type { BookingConfirmation } from "@/lib/chat/types";
import { bookingToIcs, icsDataUrl } from "@/lib/client/ics";

const booking: BookingConfirmation = {
  uid: "abc123",
  start: "2026-10-17T10:00:00.000Z",
  end: "2026-10-17T10:15:00.000Z",
  timeZone: "Asia/Kolkata",
  attendeeName: "Jane Doe",
  attendeeEmail: "jane@acme.com",
  meetingUrl: "https://cal.com/video/abc123"
};

const stamp = new Date("2026-10-16T08:30:05.123Z");

function unfold(ics: string) {
  return ics.replace(/\r\n /g, "");
}

describe("bookingToIcs", () => {
  it("writes a CRLF-terminated VCALENDAR with UTC times", () => {
    const ics = bookingToIcs(booking, stamp);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);

    const lines = unfold(ics).split("\r\n");
    expect(lines.slice(0, 6)).toEqual([
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Shubham Shah//Interview booking//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT"
    ]);
    expect(lines).toContain("UID:abc123@shubham-shah");
    expect(lines).toContain("DTSTAMP:20261016T083005Z");
    expect(lines).toContain("DTSTART:20261017T100000Z");
    expect(lines).toContain("DTEND:20261017T101500Z");
    expect(lines).toContain("SUMMARY:Interview with Shubham Shah");
    expect(lines).toContain("URL:https://cal.com/video/abc123");
    expect(lines.slice(-3)).toEqual(["END:VEVENT", "END:VCALENDAR", ""]);
  });

  it("includes the meeting link in the description and escapes text", () => {
    const lines = unfold(bookingToIcs(booking, stamp)).split("\r\n");
    expect(lines).toContain(
      "DESCRIPTION:15-minute call with Shubham Shah\\, booked by Jane Doe (jane@acme.com).\\nJoin: https://cal.com/video/abc123"
    );

    const tricky = bookingToIcs({ ...booking, attendeeName: "Doe; Jane \\ Co" }, stamp);
    expect(unfold(tricky)).toContain("booked by Doe\\; Jane \\\\ Co (jane@acme.com)");
  });

  it("derives the UID from the start time when the booking has none", () => {
    const ics = bookingToIcs({ ...booking, uid: null, meetingUrl: null }, stamp);
    expect(ics).toContain("UID:interview-20261017T100000Z@shubham-shah\r\n");
    expect(ics).not.toContain("LOCATION:");
    expect(ics).not.toContain("Join:");
  });

  it("folds lines at 75 octets without splitting multi-byte characters", () => {
    const ics = bookingToIcs({ ...booking, attendeeName: "Zoë Ångström-Ñúñez ".repeat(6).trim() }, stamp);
    const encoder = new TextEncoder();
    for (const line of ics.split("\r\n")) {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
    expect(ics).toMatch(/\r\n [^\s]/);
    expect(unfold(ics)).toContain("Zoë Ångström-Ñúñez Zoë");
  });
});

describe("icsDataUrl", () => {
  it("encodes the calendar as a text/calendar data URL", () => {
    const ics = bookingToIcs(booking, stamp);
    const url = icsDataUrl(ics);
    expect(url.startsWith("data:text/calendar;charset=utf-8,BEGIN%3AVCALENDAR%0D%0A")).toBe(true);
    expect(decodeURIComponent(url.slice(url.indexOf(",") + 1))).toBe(ics);
  });
});
