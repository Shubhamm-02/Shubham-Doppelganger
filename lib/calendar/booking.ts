import type { BookingConfirmation } from "@/lib/chat/types";
import { calFetch, CalApiError } from "@/lib/calendar/client";
import { CALENDAR_TIME_ZONE, eventTypeId, isCalendarConfigured } from "@/lib/calendar/config";
import { isHostEmail } from "@/lib/calendar/contacts";

export type BookingFailureReason =
  | "slot_unavailable"
  | "host_email"
  | "attendee_rejected"
  | "not_configured"
  | "limit_reached"
  | "unknown";

type CalBookingResponse = {
  data?: {
    uid?: string;
    start?: string;
    end?: string;
    meetingUrl?: string;
    location?: string;
  };
};

const MEETING_MINUTES = 15;
const USER_MESSAGES: Record<BookingFailureReason, string> = {
  slot_unavailable: "That slot is no longer available. Please choose another time.",
  host_email:
    "Please use the interviewer's email address, not Shubham's own email, so Cal.com can send the invite to the right attendee.",
  attendee_rejected:
    "Cal.com did not accept those attendee details. Please double-check the name and email address and try again.",
  not_configured:
    "I can collect the interview details, but live calendar booking is not connected yet.",
  limit_reached:
    "You've reached today's limit for booking calls here. To change a call you already booked, use the link in your calendar invite.",
  unknown: "I could not complete the booking just now. Please try again in a moment."
};

export class BookingError extends Error {
  readonly reason: BookingFailureReason;
  readonly userMessage: string;

  constructor(reason: BookingFailureReason, options?: { cause?: unknown }) {
    super(USER_MESSAGES[reason], options);
    this.name = "BookingError";
    this.reason = reason;
    this.userMessage = USER_MESSAGES[reason];
  }
}

function failureReason(error: unknown): BookingFailureReason {
  if (!(error instanceof CalApiError)) return "unknown";

  const detail = error.detail.toLowerCase();
  if (
    error.status === 409 ||
    /already\b.*\bbook|not available|unavailable|no[ _]available|slot/.test(detail)
  ) {
    return "slot_unavailable";
  }
  if (/host|owner|organizer|same email/.test(detail)) return "host_email";
  if (/email|attendee/.test(detail)) return "attendee_rejected";
  return "unknown";
}

function meetingUrlFrom(data: CalBookingResponse["data"]) {
  return (
    [data?.meetingUrl, data?.location].find(
      (value): value is string => typeof value === "string" && /^https?:\/\//i.test(value)
    ) ?? null
  );
}

export async function createBooking(input: {
  start: string;
  name: string;
  email: string;
}): Promise<BookingConfirmation> {
  const typeId = eventTypeId();
  if (!typeId || !isCalendarConfigured()) throw new BookingError("not_configured");
  if (isHostEmail(input.email)) throw new BookingError("host_email");

  try {
    const start = new Date(input.start).toISOString();
    const response = await calFetch<CalBookingResponse>("/bookings", {
      endpoint: "bookings",
      method: "POST",
      body: JSON.stringify({
        start,
        eventTypeId: typeId,
        attendee: {
          name: input.name,
          email: input.email,
          timeZone: CALENDAR_TIME_ZONE,
          language: "en"
        },
        bookingFieldsResponses: {
          title: `Interview with ${input.name}`,
          notes: "Booked by Wizard, Shubham Shah's AI representative."
        },
        metadata: { source: "shubham-ai-representative" }
      })
    });
    const booking = response.data;
    const bookedStart = booking?.start ?? start;

    return {
      uid: booking?.uid ?? null,
      start: bookedStart,
      end:
        booking?.end ??
        new Date(Date.parse(bookedStart) + MEETING_MINUTES * 60_000).toISOString(),
      timeZone: CALENDAR_TIME_ZONE,
      attendeeName: input.name,
      attendeeEmail: input.email,
      meetingUrl: meetingUrlFrom(booking)
    };
  } catch (error) {
    const reason = failureReason(error);
    if (reason === "unknown") console.error("Cal.com booking failed", error);
    throw new BookingError(reason, { cause: error });
  }
}
