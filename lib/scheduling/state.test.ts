import { describe, expect, it } from "vitest";
import {
  initialSchedulingState,
  parseSchedulingState,
  toSnapshot,
  type SchedulingState
} from "@/lib/scheduling/state";

const NOW = new Date("2026-10-16T06:30:00.000Z");

const slot = {
  id: "s1",
  start: "2026-10-17T10:00:00.000Z",
  end: "2026-10-17T10:15:00.000Z",
  label: "3:30 PM"
};

const booked: SchedulingState = {
  step: "booked",
  dateKey: "2026-10-17",
  offeredSlots: [slot],
  selectedSlotId: "s1",
  name: "Jane Doe",
  email: "jane@acme.com",
  emailConfirmed: true,
  booking: {
    uid: "booking-1",
    start: slot.start,
    end: "2026-10-17T10:15:00.000Z",
    timeZone: "Asia/Kolkata",
    attendeeName: "Jane Doe",
    attendeeEmail: "jane@acme.com",
    meetingUrl: null
  },
  updatedAt: NOW.toISOString(),
  lockedAt: null
};

describe("scheduling state", () => {
  it("starts idle with nothing collected", () => {
    expect(initialSchedulingState(NOW)).toEqual({
      step: "idle",
      dateKey: null,
      offeredSlots: [],
      selectedSlotId: null,
      name: null,
      email: null,
      emailConfirmed: false,
      booking: null,
      updatedAt: "2026-10-16T06:30:00.000Z",
      lockedAt: null
    });
  });

  it("round-trips a stored state", () => {
    expect(parseSchedulingState(JSON.parse(JSON.stringify(booked)))).toEqual(booked);
  });

  it("drops unknown keys", () => {
    expect(parseSchedulingState({ ...booked, legacy: true })).toEqual(booked);
  });

  it("reads a state saved without a lock as unlocked", () => {
    const { lockedAt: _lockedAt, ...unlocked } = booked;
    expect(parseSchedulingState(unlocked)).toEqual(booked);
  });

  it.each([
    ["null", null],
    ["a string", "awaiting_slot"],
    ["an unknown step", { ...booked, step: "teleporting" }],
    ["a malformed date", { ...booked, dateKey: "Oct 17" }],
    ["an impossible date", { ...booked, dateKey: "2026-02-30" }],
    ["a malformed slot", { ...booked, offeredSlots: [{ id: "s1" }] }],
    ["a slot time that is not a time", { ...booked, offeredSlots: [{ ...slot, start: "garbage" }] }],
    ["a booking time that is not a time", { ...booked, booking: { ...booked.booking, end: "soon" } }],
    ["an updatedAt that is not a time", { ...booked, updatedAt: "not a date" }],
    ["a missing field", { ...booked, emailConfirmed: undefined }]
  ])("falls back to the idle state for %s", (_label, value) => {
    expect(parseSchedulingState(value)).toMatchObject({
      step: "idle",
      offeredSlots: [],
      booking: null
    });
  });

  it("exposes the wire snapshot", () => {
    expect(toSnapshot(booked)).toEqual({
      step: "booked",
      dateKey: "2026-10-17",
      slots: [slot],
      selectedSlotId: "s1",
      attendee: { name: "Jane Doe", email: "jane@acme.com" },
      booking: booked.booking
    });
  });
});
