import { describe, expect, it } from "vitest";
import { extractPreferredTimeWindow, toMinutes } from "@/lib/calendar/times";

function window(text: string) {
  const parsed = extractPreferredTimeWindow(text);
  return parsed && [parsed.startMinutes, parsed.endMinutes, parsed.exact];
}

describe("toMinutes", () => {
  it("applies meridians", () => {
    expect(toMinutes("3", "30", "pm")).toBe(15 * 60 + 30);
    expect(toMinutes("12", "0", "am")).toBe(0);
    expect(toMinutes("12", "15", "pm")).toBe(12 * 60 + 15);
    expect(toMinutes("15", "30")).toBe(15 * 60 + 30);
  });

  it("reads bare 1-7 as working-hours afternoon", () => {
    expect(toMinutes("3")).toBe(15 * 60);
    expect(toMinutes("10")).toBe(10 * 60);
  });
});

describe("extractPreferredTimeWindow", () => {
  it("reads ranges", () => {
    expect(window("2-4pm")).toEqual([14 * 60, 16 * 60, false]);
    expect(window("tomorrow 2 to 4 pm")).toEqual([14 * 60, 16 * 60, false]);
    expect(window("11-1pm")).toEqual([11 * 60, 13 * 60, false]);
    expect(window("between 10:30 am – 12")).toEqual([10 * 60 + 30, 12 * 60, false]);
  });

  it("reads exact times", () => {
    expect(window("3:30 pm")).toEqual([15 * 60 + 30, 15 * 60 + 31, true]);
    expect(window("3.30 p.m.")).toEqual([15 * 60 + 30, 15 * 60 + 31, true]);
    expect(window("15:30")).toEqual([15 * 60 + 30, 15 * 60 + 31, true]);
    expect(window("Friday at 4")).toEqual([16 * 60, 16 * 60 + 1, true]);
    expect(window("noon")).toEqual([12 * 60, 12 * 60 + 1, true]);
  });

  it("reads open-ended bounds and parts of the day", () => {
    expect(window("after 3pm")).toEqual([15 * 60, 24 * 60, false]);
    expect(window("before 1 pm")).toEqual([0, 13 * 60, false]);
    expect(window("tomorrow afternoon")).toEqual([12 * 60, 17 * 60, false]);
  });

  it("keeps the matched text for read-back", () => {
    expect(extractPreferredTimeWindow("Oct 17, 2-4pm")?.text).toBe("2-4pm");
  });

  it("does not read dates or durations as times", () => {
    expect(extractPreferredTimeWindow("2026-10-17")).toBeNull();
    expect(extractPreferredTimeWindow("a 15-minute call on Oct 17")).toBeNull();
    expect(extractPreferredTimeWindow("tomorrow")).toBeNull();
  });
});
