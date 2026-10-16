import { describe, expect, it } from "vitest";
import {
  addDays,
  dateKeyInZone,
  extractTargetDateKey,
  formatDateKey,
  formatTimeInZone,
  isValidDateKey,
  minutesInZone
} from "@/lib/calendar/dates";

const TIME_ZONE = "Asia/Kolkata";
const FRIDAY_EVENING = new Date("2026-10-16T12:00:00Z");

function target(text: string, now = FRIDAY_EVENING) {
  return extractTargetDateKey(text, { now, timeZone: TIME_ZONE });
}

describe("zone helpers", () => {
  it("uses the IST calendar day, not the UTC one", () => {
    const utcEvening = new Date("2026-10-16T19:00:00Z");
    expect(dateKeyInZone(utcEvening, "UTC")).toBe("2026-10-16");
    expect(dateKeyInZone(utcEvening, TIME_ZONE)).toBe("2026-10-17");
    expect(target("today", utcEvening)).toBe("2026-10-17");
    expect(target("tomorrow", utcEvening)).toBe("2026-10-18");
  });

  it("formats IST times with a plain space", () => {
    const start = new Date("2026-10-17T10:00:00Z");
    expect(formatTimeInZone(start, TIME_ZONE)).toBe("3:30 PM");
    expect(minutesInZone(start, TIME_ZONE)).toBe(15 * 60 + 30);
  });

  it("adds days across month and year ends", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("formats a date key without shifting the day", () => {
    expect(formatDateKey("2026-10-17")).toBe("Sat, Oct 17");
    expect(formatDateKey("2027-01-01")).toBe("Fri, Jan 1");
  });

  it("accepts only real calendar dates as date keys", () => {
    expect(isValidDateKey("2028-02-29")).toBe(true);
    expect(isValidDateKey("2026-02-29")).toBe(false);
    expect(isValidDateKey("2026-02-31")).toBe(false);
    expect(isValidDateKey("2026-13-45")).toBe(false);
    expect(isValidDateKey("2026-1-05")).toBe(false);
    expect(isValidDateKey("17/10/2026")).toBe(false);
  });
});

describe("extractTargetDateKey", () => {
  it("reads relative days", () => {
    expect(target("today please")).toBe("2026-10-16");
    expect(target("tomorrow at 3pm")).toBe("2026-10-17");
    expect(target("Day after tomorrow works")).toBe("2026-10-18");
    expect(target("tmrw?")).toBe("2026-10-17");
  });

  it("rolls tomorrow over the year end", () => {
    const newYearsEve = new Date("2026-12-31T06:00:00Z");
    expect(target("tomorrow", newYearsEve)).toBe("2027-01-01");
    expect(target("day after tomorrow", newYearsEve)).toBe("2027-01-02");
  });

  it("reads ISO dates and rejects impossible ones", () => {
    expect(target("2026-10-20 works")).toBe("2026-10-20");
    expect(target("2026-02-30")).toBeNull();
  });

  it("reads month and day in either order", () => {
    expect(target("Oct 17")).toBe("2026-10-17");
    expect(target("17 Oct")).toBe("2026-10-17");
    expect(target("Oct. 20th at 2pm")).toBe("2026-10-20");
    expect(target("the 21st of October")).toBe("2026-10-21");
    expect(target("October seventeenth")).toBe("2026-10-17");
    expect(target("twenty-first of October")).toBe("2026-10-21");
    expect(target("November 3, 2027")).toBe("2027-11-03");
  });

  it("moves a month and day that already passed in IST to next year", () => {
    expect(target("Jan 5")).toBe("2027-01-05");
    expect(target("Oct 15")).toBe("2027-10-15");
    expect(target("Oct 16")).toBe("2026-10-16");

    const decemberNow = new Date("2026-12-20T08:00:00Z");
    expect(target("Jan 3", decemberNow)).toBe("2027-01-03");
    expect(target("December 25", decemberNow)).toBe("2026-12-25");
  });

  it("resolves weekdays to the next occurrence, never today", () => {
    expect(target("Friday")).toBe("2026-10-23");
    expect(target("monday")).toBe("2026-10-19");
    expect(target("sat 3pm")).toBe("2026-10-17");
    expect(target("next Thursday")).toBe("2026-10-22");
  });

  it("prefers the last date mentioned", () => {
    expect(target("not tomorrow, Monday instead")).toBe("2026-10-19");
    expect(target("Monday or actually Oct 20")).toBe("2026-10-20");
  });

  it("does not treat may, first or second alone as dates", () => {
    expect(target("may I book a call")).toBeNull();
    expect(target("the first one")).toBeNull();
    expect(target("second")).toBeNull();
    expect(target("What did Shubham build first?")).toBeNull();
    expect(target("it may take a second")).toBeNull();
  });

  it("reads may and first when paired as a date", () => {
    expect(target("May first")).toBe("2027-05-01");
    expect(target("first of May")).toBe("2027-05-01");
    expect(target("May 2nd")).toBe("2027-05-02");
  });

  it("ignores words that only contain a month or weekday", () => {
    expect(target("17 marketing roles")).toBeNull();
    expect(target("a monthly sync")).toBeNull();
  });
});
