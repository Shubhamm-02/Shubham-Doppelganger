import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingError, createBooking } from "@/lib/calendar/booking";

const fetchMock = vi.fn<typeof fetch>();
const BOOKING = {
  start: "2026-10-17T10:00:00.000Z",
  name: "Jane Doe",
  email: "jane@acme.com"
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

async function bookingError() {
  try {
    await createBooking(BOOKING);
  } catch (error) {
    if (error instanceof BookingError) return error;
    throw error;
  }
  throw new Error("Expected createBooking to fail.");
}

beforeEach(() => {
  vi.stubEnv("CAL_API_KEY", "cal_test_key");
  vi.stubEnv("CAL_EVENT_TYPE_ID", "42");
  vi.stubEnv("CAL_API_BASE_URL", "https://cal.test/v2");
  vi.stubEnv("CAL_API_VERSION", "");
  vi.stubEnv("CAL_HOST_EMAILS", "");
  vi.stubEnv("CAL_HOST_EMAIL", "");
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createBooking", () => {
  it("books the slot and fills in what Cal.com leaves out", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "success",
        data: { uid: "bk_1", start: BOOKING.start, location: "https://meet.example/abc" }
      })
    );

    await expect(createBooking(BOOKING)).resolves.toEqual({
      uid: "bk_1",
      start: BOOKING.start,
      end: "2026-10-17T10:15:00.000Z",
      timeZone: "Asia/Kolkata",
      attendeeName: "Jane Doe",
      attendeeEmail: "jane@acme.com",
      meetingUrl: "https://meet.example/abc"
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://cal.test/v2/bookings");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer cal_test_key",
      "cal-api-version": "2026-02-25",
      "Content-Type": "application/json"
    });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      start: BOOKING.start,
      eventTypeId: 42,
      attendee: { name: "Jane Doe", email: "jane@acme.com", timeZone: "Asia/Kolkata" }
    });
  });

  it("keeps Cal.com's end time and ignores non-URL locations", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        status: "success",
        data: {
          start: BOOKING.start,
          end: "2026-10-17T10:30:00.000Z",
          location: "integrations:daily"
        }
      })
    );

    await expect(createBooking(BOOKING)).resolves.toMatchObject({
      uid: null,
      end: "2026-10-17T10:30:00.000Z",
      meetingUrl: null
    });
  });

  it("rejects the host's own email before calling Cal.com", async () => {
    await expect(
      createBooking({ ...BOOKING, email: "ShubhamShah473@gmail.com" })
    ).rejects.toMatchObject({ reason: "host_email" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a missing configuration", async () => {
    vi.stubEnv("CAL_API_KEY", "");
    await expect(createBooking(BOOKING)).rejects.toMatchObject({ reason: "not_configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [
      400,
      { error: { message: "User either already has booking at this time or is not available" } },
      "slot_unavailable"
    ],
    [409, { message: "Conflict" }, "slot_unavailable"],
    [400, { error: { message: "no_available_users_found_error" } }, "slot_unavailable"],
    [400, { message: "Attendee email cannot be the same as the host email" }, "host_email"],
    [
      400,
      { error: { message: "Bad request", details: { "attendee.email": "must be an email" } } },
      "attendee_rejected"
    ],
    [401, { message: "Invalid API key" }, "unknown"],
    [500, { message: "Internal server error" }, "unknown"]
  ])("maps a %i Cal.com error to %j", async (status, body, reason) => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error", ...body }, status));

    const error = await bookingError();
    expect(error.reason).toBe(reason);
    expect(error.userMessage).not.toMatch(/already has booking|cannot be the same|must be an email|API key|Internal/);
  });

  it("maps network failures and non-JSON replies to unknown", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await bookingError()).reason).toBe("unknown");

    fetchMock.mockResolvedValueOnce(new Response("<html>Bad gateway</html>", { status: 502 }));
    expect((await bookingError()).reason).toBe("unknown");
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
