import { describe, expect, it } from "vitest";
import {
  differsFromIst,
  formatDayHeader,
  formatDuration,
  formatIstTime,
  formatLocalTime,
  formatWait,
  formatZoneName,
  istDateKey,
  sessionGroup,
  shiftDateKey,
  visitorTimeZone
} from "@/lib/client/format-time";

const slot = "2026-10-17T05:00:00.000Z";

describe("time formatting", () => {
  it("formats IST and visitor-local times with plain spaces", () => {
    expect(formatIstTime(slot)).toBe("10:30 AM");
    expect(formatLocalTime(slot, "America/Los_Angeles")).toBe("10:00 PM");
    expect(formatLocalTime(slot, "Europe/London")).toBe("6:00 AM");
  });

  it("names the zone", () => {
    expect(formatZoneName(slot, "America/Los_Angeles")).toBe("PDT");
    expect(formatZoneName(slot, "Asia/Kolkata")).toBe("GMT+5:30");
  });

  it("compares offsets rather than zone names", () => {
    expect(differsFromIst("Asia/Kolkata", slot)).toBe(false);
    expect(differsFromIst("Asia/Calcutta", slot)).toBe(false);
    expect(differsFromIst("Asia/Colombo", slot)).toBe(false);
    expect(differsFromIst("America/New_York", slot)).toBe(true);
    expect(differsFromIst("Asia/Kathmandu", slot)).toBe(true);
  });

  it("returns a usable visitor time zone", () => {
    expect(() => formatLocalTime(slot, visitorTimeZone())).not.toThrow();
  });

  it("formats day headers from date keys without zone drift", () => {
    expect(formatDayHeader("2026-10-17")).toBe("Saturday, Oct 17");
    expect(formatDayHeader("2024-10-17")).toBe("Thursday, Oct 17");
  });

  it("derives and shifts IST date keys", () => {
    expect(istDateKey("2026-10-16T19:00:00.000Z")).toBe("2026-10-17");
    expect(istDateKey("2026-10-16T18:00:00.000Z")).toBe("2026-10-16");
    expect(shiftDateKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDateKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("sessionGroup", () => {
  const now = new Date(2026, 9, 16, 9, 30);

  it("groups by the visitor's calendar day", () => {
    expect(sessionGroup(new Date(2026, 9, 16, 0, 1), now)).toBe("Today");
    expect(sessionGroup(new Date(2026, 9, 15, 23, 59), now)).toBe("Yesterday");
    expect(sessionGroup(new Date(2026, 9, 15, 0, 0), now)).toBe("Yesterday");
    expect(sessionGroup(new Date(2026, 9, 14, 23, 59), now)).toBe("Earlier");
    expect(sessionGroup(new Date(2026, 9, 1).toISOString(), new Date(2026, 9, 2, 8))).toBe("Yesterday");
  });

  it("treats slightly-future timestamps as today", () => {
    expect(sessionGroup(new Date(2026, 9, 16, 9, 31), now)).toBe("Today");
  });
});

describe("formatDuration", () => {
  it("formats mm:ss with zero padding", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(9_999)).toBe("00:09");
    expect(formatDuration(61_000)).toBe("01:01");
    expect(formatDuration(3_599_000)).toBe("59:59");
  });

  it("adds hours past an hour and clamps negatives", () => {
    expect(formatDuration(3_661_000)).toBe("1:01:01");
    expect(formatDuration(-500)).toBe("00:00");
  });
});

describe("formatWait", () => {
  it("counts seconds under a minute and minutes beyond it", () => {
    expect(formatWait(0.2)).toBe("1s");
    expect(formatWait(59)).toBe("59s");
    expect(formatWait(60)).toBe("1m");
    expect(formatWait(291)).toBe("4m 51s");
  });
});
