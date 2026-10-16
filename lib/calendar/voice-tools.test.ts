import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bookInterview, getAvailability } from "@/lib/calendar/voice-tools";

const fetchMock = vi.fn<typeof fetch>();
const SLOT_STARTS = [
  "2026-10-17T10:00:00.000+05:30",
  "2026-10-17T14:30:00.000+05:30",
  "2026-10-17T15:30:00.000+05:30",
  "2026-10-17T16:00:00.000+05:30"
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

function requestedPaths() {
  return fetchMock.mock.calls.map(([url]) => new URL(String(url)).pathname);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  vi.stubEnv("CAL_API_KEY", "cal_test_key");
  vi.stubEnv("CAL_EVENT_TYPE_ID", "42");
  vi.stubEnv("CAL_API_BASE_URL", "https://cal.test/v2");
  vi.stubEnv("CAL_HOST_EMAILS", "");
  vi.stubEnv("CAL_HOST_EMAIL", "");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url, init) =>
    init?.method === "POST"
      ? jsonResponse({ status: "success", data: JSON.parse(String(init.body)) })
      : jsonResponse({
          status: "success",
          data: { "2026-10-17": SLOT_STARTS.map((start) => ({ start })) }
        })
  );
});

afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("getAvailability", () => {
  it("speaks up to three numbered options", async () => {
    const result = await getAvailability({ preferredWindow: "tomorrow" });

    expect(result.message).toBe(
      "I found these available 15-minute interview slots for Sat, Oct 17: option 1: 10:00 AM; option 2: 2:30 PM; option 3: 3:30 PM. Which option do you want: 1, 2, or 3?"
    );
    expect(result.slots?.map((slot) => slot.start)).toEqual(SLOT_STARTS.slice(0, 3));
  });

  it("narrows to the preferred window", async () => {
    const result = await getAvailability({ preferredWindow: "Oct 17, 3-5pm" });

    expect(result.message).toBe(
      "I found these available 15-minute interview slots for Sat, Oct 17, 3-5PM: option 1: 3:30 PM; option 2: 4:00 PM. Which option do you want: 1 or 2?"
    );
  });

  it("asks for a day it can understand", async () => {
    const result = await getAvailability({ preferredWindow: "sometime soon" });

    expect(result.message).toMatch(/^Which day should I check\?/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("says when the calendar is not connected", async () => {
    vi.stubEnv("CAL_API_KEY", "");

    await expect(getAvailability({ preferredWindow: "tomorrow" })).resolves.toEqual({
      message:
        "I can collect the interview details, but live calendar availability is not connected yet."
    });
  });
});

describe("bookInterview", () => {
  it("lists every missing detail", async () => {
    const result = await bookInterview({ email: "jane@acme.com", preferredWindow: "tomorrow" });

    expect(result.message).toBe(
      "I still need name, confirmation that jane@acme.com is the correct email, which proposed slot you want before I can book the interview."
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("books the chosen slotStart and completes a Gmail username", async () => {
    const result = await bookInterview({
      name: "Rahul Verma",
      email: "rahul.verma",
      emailConfirmed: true,
      preferredWindow: "tomorrow",
      slotStart: SLOT_STARTS[2]
    });

    expect(result.message).toBe(
      "Booked. The interview is confirmed for Sat, Oct 17 at 3:30 PM. A calendar invite should be sent to rahul.verma@gmail.com."
    );
    expect(requestedPaths()).toEqual(["/v2/bookings"]);
  });

  it("finds the slot again from the spoken selection", async () => {
    const result = await bookInterview({
      name: "Jane Doe",
      email: "jane@acme.com",
      emailConfirmed: "yes",
      preferredWindow: "tomorrow",
      selection: "second one"
    });

    expect(result.message).toMatch(/^Booked\. The interview is confirmed for Sat, Oct 17 at 2:30 PM\./);
    expect(requestedPaths()).toEqual(["/v2/slots", "/v2/bookings"]);
  });

  it("does not guess when the selection matches nothing", async () => {
    const result = await bookInterview({
      name: "Jane Doe",
      email: "jane@acme.com",
      emailConfirmed: true,
      preferredWindow: "tomorrow at 6pm"
    });

    expect(result.message).toMatch(/^I could not find an available 15-minute slot at that time/);
    expect(requestedPaths()).toEqual(["/v2/slots"]);
  });

  it("refuses the host's own email", async () => {
    const result = await bookInterview({
      name: "Shubham",
      email: "shubhamshah473@gmail.com",
      emailConfirmed: true,
      preferredWindow: "tomorrow",
      slotStart: SLOT_STARTS[0]
    });

    expect(result.message).toMatch(/not Shubham's own email/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("explains a slot that was just taken", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ status: "error", message: "User already has booking at this time" }, 400)
    );

    const result = await bookInterview({
      name: "Jane Doe",
      email: "jane@acme.com",
      emailConfirmed: true,
      preferredWindow: "tomorrow",
      slotStart: SLOT_STARTS[0]
    });

    expect(result.message).toBe("That slot is no longer available. Please choose another time.");
  });
});
