import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OfferedSlot } from "@/lib/chat/types";
import { BookingError } from "@/lib/calendar/booking";
import { CalApiError } from "@/lib/calendar/client";
import { findSlots, selectSlot, slotIdFor } from "@/lib/calendar/slots";

function offered(start: string, label: string): OfferedSlot {
  return { id: slotIdFor(start), start, end: null, label };
}

const SLOTS = [
  offered("2026-10-17T04:30:00.000Z", "10:00 AM"),
  offered("2026-10-17T09:00:00.000Z", "2:30 PM"),
  offered("2026-10-17T10:00:00.000Z", "3:30 PM"),
  offered("2026-10-17T10:30:00.000Z", "4:00 PM")
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("slotIdFor", () => {
  it("is stable for the same instant in any ISO spelling", () => {
    const id = slotIdFor("2026-10-17T10:00:00.000Z");
    expect(id).toMatch(/^s[0-9a-z]+$/);
    expect(slotIdFor("2026-10-17T15:30:00+05:30")).toBe(id);
    expect(slotIdFor("2026-10-17T10:00:00Z")).toBe(id);
    expect(slotIdFor("2026-10-17T10:15:00.000Z")).not.toBe(id);
  });
});

describe("selectSlot", () => {
  it.each([
    ["2", 1],
    ["#2", 1],
    ["option 2", 1],
    ["Slot 2.", 1],
    ["2 please", 1],
    ["second", 1],
    ["the second one", 1],
    ["I'll take the first", 0],
    ["the 1st one", 0],
    ["option two", 1],
    ["last one", 3],
    ["3:30", 2],
    ["3:30 pm", 2],
    ["3.30pm", 2],
    ["15:30", 2],
    ["at 4", 3],
    ["the 4pm one", 3],
    ["10 am works", 0],
    ["option 3 at 3:30", 2]
  ])("reads %j", (text, index) => {
    expect(selectSlot(text, SLOTS)).toBe(SLOTS[index]);
  });

  it.each([
    "",
    "2 or 3",
    "option 2 at 4pm",
    "at 5",
    "7",
    "just a second",
    "the second of November",
    "tomorrow instead"
  ])("returns undefined for %j", (text) => {
    expect(selectSlot(text, SLOTS)).toBeUndefined();
  });

  it("reads a number past the option count as an hour", () => {
    expect(selectSlot("4", SLOTS.slice(0, 3))).toBeUndefined();
    expect(selectSlot("4", [SLOTS[0], SLOTS[3]])).toBe(SLOTS[3]);
  });
});

describe("findSlots", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    vi.stubEnv("CAL_API_KEY", "cal_test_key");
    vi.stubEnv("CAL_EVENT_TYPE_ID", "42");
    vi.stubEnv("CAL_API_BASE_URL", "https://cal.test/v2/");
    vi.stubEnv("CAL_SLOTS_API_VERSION", "");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation(async () =>
      jsonResponse({
        status: "success",
        data: {
          "2026-10-17": [
            { start: "2026-10-17T16:00:00.000+05:30", end: "2026-10-17T16:15:00.000+05:30" },
            { start: "2026-10-17T10:00:00.000+05:30", end: "2026-10-17T10:15:00.000+05:30" },
            { start: "2026-10-17T15:30:00.000+05:30", end: "2026-10-17T15:45:00.000+05:30" },
            { start: "2026-10-17T14:30:00.000+05:30", end: "2026-10-17T14:45:00.000+05:30" }
          ],
          "2026-10-18": [{ start: "2026-10-18T10:00:00.000+05:30" }]
        }
      })
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("asks Cal.com for the IST day and returns that day's slots in order", async () => {
    const slots = await findSlots("2026-10-17");

    const [url, init] = fetchMock.mock.calls[0];
    const requested = new URL(String(url));
    expect(`${requested.origin}${requested.pathname}`).toBe("https://cal.test/v2/slots");
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      eventTypeId: "42",
      start: "2026-10-17",
      end: "2026-10-18",
      timeZone: "Asia/Kolkata",
      format: "range"
    });
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer cal_test_key",
      "cal-api-version": "2024-09-04"
    });
    expect(slots.map((slot) => slot.label)).toEqual(["10:00 AM", "2:30 PM", "3:30 PM", "4:00 PM"]);
    expect(slots[0]).toEqual({
      id: slotIdFor("2026-10-17T10:00:00.000+05:30"),
      start: "2026-10-17T10:00:00.000+05:30",
      end: "2026-10-17T10:15:00.000+05:30",
      label: "10:00 AM"
    });
  });

  it("filters by the preferred time and falls back to the whole day", async () => {
    const afternoon = await findSlots("2026-10-17", { preference: "around 3:30pm" });
    expect(afternoon.map((slot) => slot.label)).toEqual(["3:30 PM"]);

    const window = await findSlots("2026-10-17", { preference: "2-4pm", limit: 1 });
    expect(window.map((slot) => slot.label)).toEqual(["2:30 PM"]);

    const evening = await findSlots("2026-10-17", { preference: "8pm" });
    expect(evening).toHaveLength(4);
  });

  it("refuses to call Cal.com when it is not configured", async () => {
    vi.stubEnv("CAL_EVENT_TYPE_ID", "not-a-number");
    await expect(findSlots("2026-10-17")).rejects.toMatchObject({
      reason: "not_configured"
    });
    await expect(findSlots("2026-10-17")).rejects.toBeInstanceOf(BookingError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("surfaces Cal.com failures as CalApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", message: "boom" }, 500));
    await expect(findSlots("2026-10-17")).rejects.toEqual(new CalApiError(500, "boom"));
  });
});
