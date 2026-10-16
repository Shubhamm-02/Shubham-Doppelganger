import type { ApiErrorCode } from "@/lib/http";

export type Source = {
  id: string;
  path: string;
  title: string;
  section: string;
  snippet: string;
  url: string | null;
};

export type OfferedSlot = {
  id: string;
  start: string;
  end: string | null;
  label: string;
};

export type BookingConfirmation = {
  uid: string | null;
  start: string;
  end: string;
  timeZone: string;
  attendeeName: string;
  attendeeEmail: string;
  meetingUrl: string | null;
};

export type SchedulingStep =
  | "idle"
  | "awaiting_day"
  | "awaiting_slot"
  | "awaiting_details"
  | "awaiting_confirmation"
  | "booked";

export type SchedulingSnapshot = {
  step: SchedulingStep;
  dateKey: string | null;
  slots: OfferedSlot[];
  selectedSlotId: string | null;
  attendee: { name: string | null; email: string | null };
  booking: BookingConfirmation | null;
};

export type ChatIntent = "profile" | "scheduling";

export type ChatStage = "searching" | "checking_calendar" | "booking";

export type ChatAction =
  | { type: "check_day"; dateKey: string }
  | { type: "book"; slotId: string; name: string; email: string };

export type ChatDone = {
  turnId: number | null;
  sessionId: number | null;
  answer: string;
  intent: ChatIntent;
  grounded: boolean;
  sources: Source[];
  scheduling: SchedulingSnapshot | null;
};

export type ChatStreamEvent =
  | { event: "meta"; data: { sessionId: number | null } }
  | { event: "status"; data: { stage: ChatStage } }
  | { event: "token"; data: { token: string } }
  | { event: "done"; data: ChatDone }
  | { event: "error"; data: { code: ApiErrorCode; message: string } };

export type TurnMetadata = {
  intent?: ChatIntent;
  sources?: Source[];
  scheduling?: SchedulingSnapshot;
  stopped?: boolean;
};
