import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingError } from "@/lib/calendar/booking";
import type { BookingConfirmation, ChatStage, OfferedSlot } from "@/lib/chat/types";
import {
  advanceScheduling,
  type SchedulingDeps,
  type SchedulingInput
} from "@/lib/scheduling/flow";
import { initialSchedulingState, type SchedulingState } from "@/lib/scheduling/state";

// Friday, Oct 16 2026, 12:00 IST.
const NOW = new Date("2026-10-16T06:30:00.000Z");
const TOMORROW = "2026-10-17";
const MONDAY = "2026-10-19";

function slot(start: string, label: string): OfferedSlot {
  return { id: `slot-${start}`, start, end: null, label };
}

const SATURDAY_SLOTS = [
  slot("2026-10-17T04:30:00.000Z", "10:00 AM"),
  slot("2026-10-17T06:00:00.000Z", "11:30 AM"),
  slot("2026-10-17T09:30:00.000Z", "3:00 PM"),
  slot("2026-10-17T10:00:00.000Z", "3:30 PM")
];
const MONDAY_SLOTS = [
  slot("2026-10-19T08:30:00.000Z", "2:00 PM"),
  slot("2026-10-19T09:00:00.000Z", "2:30 PM")
];

function confirmation(request: { slot: OfferedSlot; name: string; email: string }) {
  return {
    uid: "booking-1",
    start: request.slot.start,
    end: new Date(Date.parse(request.slot.start) + 15 * 60_000).toISOString(),
    timeZone: "Asia/Kolkata",
    attendeeName: request.name,
    attendeeEmail: request.email,
    meetingUrl: "https://cal.com/video/abc"
  } satisfies BookingConfirmation;
}

const AVAILABILITY = { [TOMORROW]: SATURDAY_SLOTS, [MONDAY]: MONDAY_SLOTS };

function fakeDeps(availability: Record<string, OfferedSlot[]> = AVAILABILITY) {
  const stages: ChatStage[] = [];
  const findSlots = vi.fn(async (dateKey: string, _preference?: string) => [
    ...(availability[dateKey] ?? [])
  ]);
  const book = vi.fn(async (request: { slot: OfferedSlot; name: string; email: string }) =>
    confirmation(request)
  );
  const deps: SchedulingDeps = {
    now: NOW,
    findSlots,
    book,
    onStage: (stage) => stages.push(stage)
  };
  return { deps, stages, findSlots, book };
}

async function converse(
  deps: SchedulingDeps,
  messages: string[],
  start: SchedulingState = initialSchedulingState(NOW)
) {
  let state = start;
  const replies: string[] = [];
  for (const text of messages) {
    const result = await advanceScheduling(state, { kind: "message", text }, deps);
    state = result.state;
    replies.push(result.reply);
  }
  return { state, replies, reply: replies.at(-1) ?? "" };
}

function act(state: SchedulingState, input: SchedulingInput, deps: SchedulingDeps) {
  return advanceScheduling(state, input, deps);
}

describe("advanceScheduling", () => {
  beforeEach(() => {
    vi.stubEnv("CAL_API_KEY", "cal_test_key");
    vi.stubEnv("CAL_EVENT_TYPE_ID", "123");
    vi.stubEnv("CAL_HOST_EMAILS", "shubham@host.dev");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("books a call in four messages", async () => {
    const { deps, stages, findSlots, book } = fakeDeps();

    const { state, replies } = await converse(deps, [
      "Can we book a call tomorrow?",
      "2",
      "Jane Doe, jane@acme.com",
      "yes"
    ]);

    expect(replies).toEqual([
      "Here's what's open on Sat, Oct 17 (IST):\n1. 10:00 AM\n2. 11:30 AM\n3. 3:00 PM\n4. 3:30 PM\n\nWhich one works? Reply with its number or the time.",
      "Great, Sat, Oct 17 at 11:30 AM IST it is. What name and email should the invite go to?",
      "I'll book Sat, Oct 17 at 11:30 AM IST for Jane Doe (jane@acme.com). Shall I go ahead?",
      "You're booked with Shubham on Sat, Oct 17 at 11:30 AM IST. The invite is on its way to jane@acme.com.\nMeeting link: https://cal.com/video/abc"
    ]);
    expect(findSlots).toHaveBeenCalledExactlyOnceWith(TOMORROW, undefined);
    expect(book).toHaveBeenCalledExactlyOnceWith({
      slot: SATURDAY_SLOTS[1],
      name: "Jane Doe",
      email: "jane@acme.com"
    });
    expect(stages).toEqual(["checking_calendar", "booking"]);
    expect(state).toEqual({
      step: "booked",
      dateKey: TOMORROW,
      offeredSlots: [],
      selectedSlotId: null,
      name: "Jane Doe",
      email: "jane@acme.com",
      emailConfirmed: true,
      booking: confirmation({ slot: SATURDAY_SLOTS[1], name: "Jane Doe", email: "jane@acme.com" }),
      updatedAt: NOW.toISOString(),
      lockedAt: null
    });
  });

  it("walks through each step when details arrive one at a time", async () => {
    const { deps } = fakeDeps();

    const { state, replies } = await converse(deps, [
      "I'd like to schedule an interview",
      "tomorrow works",
      "the 3:30 one",
      "Jane Doe",
      "my gmail is janedoe92"
    ]);

    expect(replies.slice(0, 1)).toEqual([
      "Happy to set up a 15-minute call with Shubham. Which day works for you? You can say tomorrow, a weekday, or a date."
    ]);
    expect(replies.slice(2)).toEqual([
      "Great, Sat, Oct 17 at 3:30 PM IST it is. What name and email should the invite go to?",
      "Thanks, Jane Doe. What email should the invite go to?",
      "I'll book Sat, Oct 17 at 3:30 PM IST for Jane Doe (janedoe92@gmail.com). Shall I go ahead?"
    ]);
    expect(state.step).toBe("awaiting_confirmation");
    expect(state.selectedSlotId).toBe(SATURDAY_SLOTS[3].id);
  });

  it("completes a gmail address written without .com", async () => {
    const { deps } = fakeDeps();

    const { state } = await converse(deps, ["tomorrow", "1", "Jane Doe, janedoe92@gmail"]);

    expect(state).toMatchObject({
      step: "awaiting_confirmation",
      name: "Jane Doe",
      email: "janedoe92@gmail.com"
    });
  });

  it("lists the slots again when no slot can be read", async () => {
    const { deps } = fakeDeps({ [TOMORROW]: SATURDAY_SLOTS.slice(0, 2) });

    const { state, reply } = await converse(deps, ["tomorrow", "I'm Jane, either is fine"]);

    expect(state).toMatchObject({ step: "awaiting_slot", name: "Jane", selectedSlotId: null });
    expect(reply).toBe(
      "Thanks, Jane. Which time works? Reply with its number:\n1. 10:00 AM\n2. 11:30 AM"
    );
  });

  it("states IST once per reply", async () => {
    const { deps } = fakeDeps();

    const { replies } = await converse(deps, [
      "book a call tomorrow",
      "1",
      "Jane Doe, jane@acme.com",
      "yes"
    ]);

    for (const reply of replies) expect(reply.match(/IST/g)).toHaveLength(1);
  });

  it("takes name, email, day and time from a single message", async () => {
    const { deps, findSlots } = fakeDeps();

    const { state, reply } = await converse(deps, ["Jane, jane@x.com, tomorrow 3pm"]);

    expect(reply).toBe(
      "I'll book Sat, Oct 17 at 3:00 PM IST for Jane (jane@x.com). Shall I go ahead?"
    );
    expect(state).toMatchObject({
      step: "awaiting_confirmation",
      dateKey: TOMORROW,
      selectedSlotId: SATURDAY_SLOTS[2].id,
      name: "Jane",
      email: "jane@x.com",
      emailConfirmed: false
    });
    expect(findSlots.mock.calls[0][0]).toBe(TOMORROW);
    expect(findSlots.mock.calls[0][1]).toContain("3pm");
  });

  it("says when the requested time is not open and lists the rest", async () => {
    const { deps } = fakeDeps();

    const { state, reply } = await converse(deps, ["tomorrow at 5pm please"]);

    expect(state.step).toBe("awaiting_slot");
    expect(reply).toMatch(/^That time isn't open on Sat, Oct 17\. Here's what is \(IST\):\n1\. 10:00 AM/);
  });

  it("asks for another day when the day has no open slots", async () => {
    const { deps } = fakeDeps();

    const { state, reply } = await converse(deps, ["book a call", "Sunday"]);

    expect(state).toMatchObject({ step: "awaiting_day", dateKey: "2026-10-18", offeredSlots: [] });
    expect(reply).toBe("Shubham has no open 15-minute slots on Sun, Oct 18. Which other day works?");
  });

  it("asks again when no day can be read", async () => {
    const { deps, findSlots } = fakeDeps();

    const { state, reply } = await converse(deps, ["book a call", "whenever suits him"]);

    expect(state.step).toBe("awaiting_day");
    expect(reply).toBe(
      "I couldn't tell which day you mean. Try tomorrow, a weekday like Friday, or a date like Oct 21."
    );
    expect(findSlots).not.toHaveBeenCalled();
  });

  it("re-offers slots when a new day is named mid-flow and keeps the attendee", async () => {
    const { deps } = fakeDeps();

    const { state, replies } = await converse(deps, [
      "Jane Doe, jane@acme.com, tomorrow",
      "2",
      "actually, can we do Monday instead?",
      "2"
    ]);

    expect(replies[2]).toBe(
      "Here's what's open on Mon, Oct 19 (IST):\n1. 2:00 PM\n2. 2:30 PM\n\nWhich one works? Reply with its number or the time."
    );
    expect(replies[3]).toBe(
      "I'll book Mon, Oct 19 at 2:30 PM IST for Jane Doe (jane@acme.com). Shall I go ahead?"
    );
    expect(state).toMatchObject({ dateKey: MONDAY, selectedSlotId: MONDAY_SLOTS[1].id });
  });

  it("rejects Shubham's own email and asks for the attendee's", async () => {
    const { deps, book } = fakeDeps();

    const { state, replies } = await converse(deps, [
      "tomorrow",
      "1",
      "Jane Doe, shubham@host.dev",
      "jane@acme.com"
    ]);

    expect(replies[2]).toBe(
      "Thanks, Jane Doe. That's Shubham's own email address, so the invite can't go there. What email should the invite go to?"
    );
    expect(replies[3]).toBe(
      "I'll book Sat, Oct 17 at 10:00 AM IST for Jane Doe (jane@acme.com). Shall I go ahead?"
    );
    expect(state.email).toBe("jane@acme.com");
    expect(book).not.toHaveBeenCalled();
  });

  it("applies corrections at the confirmation step and confirms again", async () => {
    const { deps, book } = fakeDeps();

    const { replies } = await converse(deps, [
      "tomorrow",
      "2",
      "Jane Doe, jane@acme.com",
      "actually use jane.doe@acme.com",
      "make it 3:30 instead",
      "my name is Jane Smith",
      "yes please"
    ]);

    expect(replies.slice(3, 6)).toEqual([
      "Updated. I'll book Sat, Oct 17 at 11:30 AM IST for Jane Doe (jane.doe@acme.com). Shall I go ahead?",
      "I'll book Sat, Oct 17 at 3:30 PM IST for Jane Doe (jane.doe@acme.com). Shall I go ahead?",
      "Updated. I'll book Sat, Oct 17 at 3:30 PM IST for Jane Smith (jane.doe@acme.com). Shall I go ahead?"
    ]);
    expect(book).toHaveBeenCalledExactlyOnceWith({
      slot: SATURDAY_SLOTS[3],
      name: "Jane Smith",
      email: "jane.doe@acme.com"
    });
  });

  it("waits for a clear yes before booking", async () => {
    const { deps, book } = fakeDeps();

    const { state, replies } = await converse(deps, [
      "tomorrow",
      "2",
      "Jane Doe, jane@acme.com",
      "hmm",
      "no"
    ]);

    expect(replies.slice(3)).toEqual([
      "Reply yes to book Sat, Oct 17 at 11:30 AM IST for Jane Doe (jane@acme.com), or tell me what to change.",
      "No problem. Tell me what to change (the time, your name or your email), or say cancel to stop."
    ]);
    expect(state.step).toBe("awaiting_confirmation");
    expect(book).not.toHaveBeenCalled();
  });

  it("re-offers the rest of the day when the chosen slot was just taken", async () => {
    const { deps, stages, findSlots, book } = fakeDeps();
    book.mockRejectedValueOnce(new BookingError("slot_unavailable"));

    const { state, replies } = await converse(deps, [
      "tomorrow",
      "2",
      "Jane Doe, jane@acme.com",
      "yes",
      "1",
      "yes"
    ]);

    expect(replies[3]).toBe(
      "Sorry, Sat, Oct 17 at 11:30 AM was just taken. Here's what's open on Sat, Oct 17 (IST):\n1. 10:00 AM\n2. 3:00 PM\n3. 3:30 PM\n\nWhich one works? Reply with its number or the time."
    );
    expect(replies[4]).toBe(
      "I'll book Sat, Oct 17 at 10:00 AM IST for Jane Doe (jane@acme.com). Shall I go ahead?"
    );
    expect(findSlots).toHaveBeenCalledTimes(2);
    expect(stages).toEqual(["checking_calendar", "booking", "checking_calendar", "booking"]);
    expect(book).toHaveBeenLastCalledWith({
      slot: SATURDAY_SLOTS[0],
      name: "Jane Doe",
      email: "jane@acme.com"
    });
    expect(state.step).toBe("booked");
  });

  it("asks for another day when the taken slot was the last one", async () => {
    const { deps, book } = fakeDeps({ [TOMORROW]: [SATURDAY_SLOTS[1]] });
    book.mockRejectedValueOnce(new BookingError("slot_unavailable"));

    const { state, reply } = await converse(deps, [
      "tomorrow",
      "1",
      "Jane Doe, jane@acme.com",
      "yes"
    ]);

    expect(state).toMatchObject({ step: "awaiting_day", offeredSlots: [], name: "Jane Doe" });
    expect(reply).toBe(
      "Sorry, Sat, Oct 17 at 11:30 AM was just taken. Shubham has no open 15-minute slots on Sat, Oct 17. Which other day works?"
    );
  });

  it("keeps the confirmation open when booking fails for an unknown reason", async () => {
    const { deps, book } = fakeDeps();
    book.mockRejectedValueOnce(new BookingError("unknown"));

    const { state, replies } = await converse(deps, [
      "tomorrow",
      "2",
      "Jane Doe, jane@acme.com",
      "yes",
      "yes"
    ]);

    expect(replies[3]).toBe(
      "I couldn't complete the booking just now. Reply yes to try again, or cancel to stop."
    );
    expect(book).toHaveBeenCalledTimes(2);
    expect(state.step).toBe("booked");
  });

  it("asks for a new email when Cal.com rejects the attendee", async () => {
    const { deps, book } = fakeDeps();
    book.mockRejectedValueOnce(new BookingError("attendee_rejected"));

    const { state, reply } = await converse(deps, [
      "tomorrow",
      "2",
      "Jane Doe, jane@acme.com",
      "yes"
    ]);

    expect(state).toMatchObject({ step: "awaiting_details", name: "Jane Doe", email: null });
    expect(reply).toMatch(/What email should the invite go to\?$/);
  });

  it("explains when the calendar cannot be reached", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { deps, findSlots } = fakeDeps();
    findSlots.mockRejectedValueOnce(new Error("fetch failed"));

    const { state, reply } = await converse(deps, ["book a call tomorrow"]);

    expect(state).toMatchObject({ step: "awaiting_day", dateKey: null });
    expect(reply).toBe("I couldn't reach Shubham's calendar just now. Please try again in a moment.");
  });

  it("cancels an in-progress booking", async () => {
    const { deps } = fakeDeps();
    const { state } = await converse(deps, ["tomorrow", "2"]);

    const cancelled = await act(state, { kind: "cancel" }, deps);

    expect(cancelled.state).toEqual(initialSchedulingState(NOW));
    expect(cancelled.reply).toBe(
      "Okay, I've stopped the booking. Just ask whenever you'd like to pick a time."
    );
  });

  it("does not drop a confirmed booking on cancel", async () => {
    const { deps } = fakeDeps();
    const { state } = await converse(deps, ["tomorrow", "2", "Jane Doe, jane@acme.com", "yes"]);

    const cancelled = await act(state, { kind: "cancel" }, deps);

    expect(cancelled.state).toEqual(state);
    expect(cancelled.reply).toBe(
      "Your call on Sat, Oct 17 is already booked. To cancel or reschedule it, use the link in your calendar invite."
    );
  });

  it("starts over when an unfinished booking has gone stale", async () => {
    const { deps, book } = fakeDeps();
    const { state } = await converse(deps, ["tomorrow", "2", "Jane Doe, jane@acme.com"]);
    const stale = { ...state, updatedAt: "2026-10-14T06:30:00.000Z" };

    const result = await act(stale, { kind: "message", text: "yes" }, deps);

    expect(book).not.toHaveBeenCalled();
    expect(result.state).toMatchObject({ step: "awaiting_day", name: null, offeredSlots: [] });
  });

  it("repeats the confirmation when a booked visitor just says yes again", async () => {
    const { deps, book } = fakeDeps();
    const { state, reply } = await converse(deps, ["tomorrow", "2", "Jane Doe, jane@acme.com", "yes"]);

    const again = await act(state, { kind: "message", text: "yes" }, deps);

    expect(book).toHaveBeenCalledTimes(1);
    expect(again.state).toEqual(state);
    expect(again.reply).toBe(reply);
  });

  it("re-offers the day instead of booking a slot that has already started", async () => {
    const { deps, book, findSlots } = fakeDeps();
    const { state } = await converse(deps, ["tomorrow", "1", "Jane Doe, jane@acme.com"]);
    // Sat, Oct 17, 10:15 IST: the 10:00 AM slot has begun.
    const later = { ...deps, now: new Date("2026-10-17T04:45:00.000Z") };
    findSlots.mockClear();

    const result = await act(state, { kind: "message", text: "yes" }, later);

    expect(book).not.toHaveBeenCalled();
    expect(findSlots).toHaveBeenCalledExactlyOnceWith(TOMORROW, undefined);
    expect(result.state).toMatchObject({ step: "awaiting_slot", offeredSlots: SATURDAY_SLOTS.slice(1) });
    expect(result.reply).toMatch(/^Sorry, 10:00 AM has already passed\. Here's what's open on Sat, Oct 17/);
  });

  it("asks for another day when the slot's whole day has passed", async () => {
    const { deps, book } = fakeDeps();
    const { state } = await converse(deps, ["tomorrow", "1", "Jane Doe, jane@acme.com"]);
    const touched = { ...state, updatedAt: "2026-10-17T12:00:00.000Z" };
    // Sun, Oct 18, 00:30 IST.
    const nextDay = { ...deps, now: new Date("2026-10-17T19:00:00.000Z") };

    const result = await act(touched, { kind: "message", text: "yes" }, nextDay);

    expect(book).not.toHaveBeenCalled();
    expect(result.state.step).toBe("awaiting_day");
    expect(result.reply).toBe("Sat, Oct 17 has already passed. Which upcoming day works for you?");
  });

  it("stops the booking when the visitor has reached the booking limit", async () => {
    const { deps, book } = fakeDeps();
    book.mockRejectedValueOnce(new BookingError("limit_reached"));
    const { state } = await converse(deps, ["tomorrow", "2", "Jane Doe, jane@acme.com"]);

    const result = await act(state, { kind: "message", text: "yes" }, deps);

    expect(result.state).toEqual(initialSchedulingState(NOW));
    expect(result.reply).toBe(
      "You've reached today's limit for booking calls here. To change a call you already booked, use the link in your calendar invite."
    );
  });

  it("starts a new booking after a completed one and reuses the attendee", async () => {
    const { deps } = fakeDeps();
    const { state } = await converse(deps, ["tomorrow", "2", "Jane Doe, jane@acme.com", "yes"]);

    const { state: next, reply } = await converse(deps, ["Monday too, at 2pm"], state);

    expect(next).toMatchObject({
      step: "awaiting_confirmation",
      booking: null,
      dateKey: MONDAY,
      emailConfirmed: false
    });
    expect(reply).toBe(
      "I'll book Mon, Oct 19 at 2:00 PM IST for Jane Doe (jane@acme.com). Shall I go ahead?"
    );
  });

  describe("actions", () => {
    async function offered(deps: SchedulingDeps) {
      return (await converse(deps, ["tomorrow"])).state;
    }

    it("offers the slots of a picked day", async () => {
      const { deps, stages, findSlots } = fakeDeps();

      const { state, reply } = await act(
        initialSchedulingState(NOW),
        { kind: "action", action: { type: "check_day", dateKey: MONDAY } },
        deps
      );

      expect(findSlots).toHaveBeenCalledExactlyOnceWith(MONDAY, undefined);
      expect(stages).toEqual(["checking_calendar"]);
      expect(state).toMatchObject({
        step: "awaiting_slot",
        dateKey: MONDAY,
        offeredSlots: MONDAY_SLOTS
      });
      expect(reply).toMatch(/^Here's what's open on Mon, Oct 19 \(IST\):/);
    });

    it("refuses to check a day that has passed", async () => {
      const { deps, findSlots } = fakeDeps();

      const { state, reply } = await act(
        initialSchedulingState(NOW),
        { kind: "action", action: { type: "check_day", dateKey: "2026-10-15" } },
        deps
      );

      expect(findSlots).not.toHaveBeenCalled();
      expect(state.step).toBe("awaiting_day");
      expect(reply).toBe("Thu, Oct 15 has already passed. Which upcoming day works for you?");
    });

    it("books an offered slot directly", async () => {
      const { deps, stages, book } = fakeDeps();
      const state = await offered(deps);

      const result = await act(
        state,
        {
          kind: "action",
          action: {
            type: "book",
            slotId: SATURDAY_SLOTS[2].id,
            name: " Jane Doe ",
            email: "Jane@Acme.com"
          }
        },
        deps
      );

      expect(book).toHaveBeenCalledExactlyOnceWith({
        slot: SATURDAY_SLOTS[2],
        name: "Jane Doe",
        email: "jane@acme.com"
      });
      expect(stages).toEqual(["checking_calendar", "booking"]);
      expect(result.state).toMatchObject({
        step: "booked",
        name: "Jane Doe",
        emailConfirmed: true
      });
    });

    it("returns the existing booking when the same book action arrives again", async () => {
      const { deps, book } = fakeDeps();
      const action: SchedulingInput = {
        kind: "action",
        action: { type: "book", slotId: SATURDAY_SLOTS[2].id, name: "Jane", email: "jane@acme.com" }
      };
      const first = await act(await offered(deps), action, deps);

      const repeated = await act(first.state, action, deps);

      expect(book).toHaveBeenCalledTimes(1);
      expect(repeated.state).toEqual(first.state);
      expect(repeated.reply).toBe(first.reply);
    });

    it("rejects a slot id that was not offered", async () => {
      const { deps, book } = fakeDeps();
      const state = await offered(deps);

      const result = await act(
        state,
        {
          kind: "action",
          action: { type: "book", slotId: "slot-forged", name: "Jane Doe", email: "jane@acme.com" }
        },
        deps
      );

      expect(book).not.toHaveBeenCalled();
      expect(result.state).toEqual(state);
      expect(result.reply).toMatch(/^That time is no longer on offer\. Pick one of these \(IST\):\n1\. 10:00 AM/);
    });

    it("asks for a day when a slot is booked without any offer", async () => {
      const { deps, book } = fakeDeps();

      const result = await act(
        initialSchedulingState(NOW),
        {
          kind: "action",
          action: {
            type: "book",
            slotId: SATURDAY_SLOTS[0].id,
            name: "Jane",
            email: "jane@acme.com"
          }
        },
        deps
      );

      expect(book).not.toHaveBeenCalled();
      expect(result.state.step).toBe("awaiting_day");
    });

    it.each([
      [{ name: "  ", email: "jane@acme.com" }, "Please enter your name (up to 100 characters)."],
      [
        { name: "J".repeat(101), email: "jane@acme.com" },
        "Please enter your name (up to 100 characters)."
      ],
      [
        { name: "Jane", email: "jane@acme" },
        "That email address doesn't look right. Please check it and try again."
      ],
      [
        { name: "Jane", email: "Shubham@Host.dev" },
        "That's Shubham's own email address, so the invite can't go there. Please use your own email address."
      ]
    ])("validates attendee details before booking %#", async (attendee, reply) => {
      const { deps, book } = fakeDeps();
      const state = await offered(deps);

      const result = await act(
        state,
        { kind: "action", action: { type: "book", slotId: SATURDAY_SLOTS[0].id, ...attendee } },
        deps
      );

      expect(book).not.toHaveBeenCalled();
      expect(result.reply).toBe(reply);
      expect(result.state.step).toBe("awaiting_slot");
    });

    it("keeps the chosen time and name when only the email is rejected", async () => {
      const { deps, book } = fakeDeps();
      const state = await offered(deps);

      const rejected = await act(
        state,
        {
          kind: "action",
          action: {
            type: "book",
            slotId: SATURDAY_SLOTS[1].id,
            name: "Jane Doe",
            email: "shubham@host.dev"
          }
        },
        deps
      );
      expect(rejected.state).toMatchObject({
        step: "awaiting_slot",
        selectedSlotId: SATURDAY_SLOTS[1].id,
        name: "Jane Doe",
        email: null
      });

      const { reply } = await converse(deps, ["jane@acme.com"], rejected.state);
      expect(reply).toBe(
        "I'll book Sat, Oct 17 at 11:30 AM IST for Jane Doe (jane@acme.com). Shall I go ahead?"
      );
      expect(book).not.toHaveBeenCalled();
    });
  });

  describe("without a calendar connection", () => {
    it("says live booking is not connected and touches nothing", async () => {
      vi.stubEnv("CAL_API_KEY", "");
      const { deps, findSlots, book } = fakeDeps();

      const message = await converse(deps, ["book a call tomorrow"]);
      const action = await act(
        initialSchedulingState(NOW),
        { kind: "action", action: { type: "check_day", dateKey: TOMORROW } },
        deps
      );

      for (const result of [message, action]) {
        expect(result.state).toEqual(initialSchedulingState(NOW));
        expect(result.reply).toBe(
          "Live calendar booking isn't connected yet, so I can't check Shubham's availability or book a call here right now."
        );
      }
      expect(findSlots).not.toHaveBeenCalled();
      expect(book).not.toHaveBeenCalled();
    });
  });
});
