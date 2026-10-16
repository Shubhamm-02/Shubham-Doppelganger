import { z } from "zod";
import { isValidDateKey } from "@/lib/calendar/dates";
import type {
  BookingConfirmation,
  OfferedSlot,
  SchedulingSnapshot,
  SchedulingStep
} from "@/lib/chat/types";

export type SchedulingState = {
  step: SchedulingStep;
  dateKey: string | null;
  offeredSlots: OfferedSlot[];
  selectedSlotId: string | null;
  name: string | null;
  email: string | null;
  emailConfirmed: boolean;
  booking: BookingConfirmation | null;
  updatedAt: string;
  // Set while a chat turn is changing this state; see lib/chat/scheduling-lock.ts.
  lockedAt: string | null;
};

const timestampSchema = z.string().refine((value) => !Number.isNaN(Date.parse(value)));

const offeredSlotSchema: z.ZodType<OfferedSlot> = z.object({
  id: z.string(),
  start: timestampSchema,
  end: timestampSchema.nullable(),
  label: z.string()
});

const bookingSchema: z.ZodType<BookingConfirmation> = z.object({
  uid: z.string().nullable(),
  start: timestampSchema,
  end: timestampSchema,
  timeZone: z.string(),
  attendeeName: z.string(),
  attendeeEmail: z.string(),
  meetingUrl: z.string().nullable()
});

const schedulingStateSchema: z.ZodType<SchedulingState> = z.object({
  step: z.enum([
    "idle",
    "awaiting_day",
    "awaiting_slot",
    "awaiting_details",
    "awaiting_confirmation",
    "booked"
  ]),
  dateKey: z.string().refine(isValidDateKey).nullable(),
  offeredSlots: z.array(offeredSlotSchema),
  selectedSlotId: z.string().nullable(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  emailConfirmed: z.boolean(),
  booking: bookingSchema.nullable(),
  updatedAt: timestampSchema,
  lockedAt: timestampSchema.nullable().default(null)
});

export function initialSchedulingState(now = new Date()): SchedulingState {
  return {
    step: "idle",
    dateKey: null,
    offeredSlots: [],
    selectedSlotId: null,
    name: null,
    email: null,
    emailConfirmed: false,
    booking: null,
    updatedAt: now.toISOString(),
    lockedAt: null
  };
}

export function parseSchedulingState(value: unknown): SchedulingState {
  const parsed = schedulingStateSchema.safeParse(value);
  return parsed.success ? parsed.data : initialSchedulingState();
}

export function toSnapshot(state: SchedulingState): SchedulingSnapshot {
  return {
    step: state.step,
    dateKey: state.dateKey,
    slots: state.offeredSlots,
    selectedSlotId: state.selectedSlotId,
    attendee: { name: state.name, email: state.email },
    booking: state.booking
  };
}
