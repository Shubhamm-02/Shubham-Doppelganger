import { z } from "zod";
import { BookingError } from "@/lib/calendar/booking";
import { CALENDAR_TIME_ZONE, isCalendarConfigured } from "@/lib/calendar/config";
import {
  extractLatestEmail,
  extractName,
  isHostEmail,
  normalizeEmailCandidate
} from "@/lib/calendar/contacts";
import {
  dateKeyInZone,
  extractTargetDateKey,
  formatDateKey,
  formatTimeInZone
} from "@/lib/calendar/dates";
import { selectSlot } from "@/lib/calendar/slots";
import { extractPreferredTimeWindow } from "@/lib/calendar/times";
import type {
  BookingConfirmation,
  ChatAction,
  ChatStage,
  OfferedSlot,
  SchedulingStep
} from "@/lib/chat/types";
import { initialSchedulingState, type SchedulingState } from "@/lib/scheduling/state";

export type SchedulingInput =
  | { kind: "message"; text: string }
  | { kind: "action"; action: ChatAction }
  | { kind: "cancel" };

export type SchedulingDeps = {
  now: Date;
  findSlots(dateKey: string, preference?: string): Promise<OfferedSlot[]>;
  book(request: { slot: OfferedSlot; name: string; email: string }): Promise<BookingConfirmation>;
  onStage(stage: ChatStage): void;
};

export type SchedulingResult = { state: SchedulingState; reply: string };

type Attendee = { name: string; email: string };

type ContactUpdate = {
  state: SchedulingState;
  notes: string[];
  nameGiven: boolean;
  changed: boolean;
};

const STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const MAX_NAME_LENGTH = 100;
const ACTIVE_STEPS = new Set<SchedulingStep>([
  "awaiting_day",
  "awaiting_slot",
  "awaiting_details",
  "awaiting_confirmation"
]);
const EMAIL_TOKEN_PATTERN = /\S+@\S+/g;
const GMAIL_USERNAME_PATTERN =
  /\b([a-z0-9._%+-]+@gmail)\b(?!\.)|\bgmail(?:\s+(?:id|address|username))?\s*(?:\bis\b|:|-)\s*([a-z0-9._%+-]+)(?![@a-z0-9._%+-])/i;
const NAME_CUE_PATTERN = /\b(?:name\s*(?:is|['’]s|[:-])|call me|i am|i['’]?m|this is)\s/i;
const YES_PATTERN =
  /^(?:yes|yeah|yep|yup|sure|ok|okay|confirm|confirmed|correct|absolutely|please do|go ahead|book it|do it|sounds good|that works|perfect)\b/i;
const NO_PATTERN = /^(?:no|nope|nah|wait|hold on|not yet)\b/i;
const emailSchema = z.email();

const NOT_CONNECTED_REPLY =
  "Live calendar booking isn't connected yet, so I can't check Shubham's availability or book a call here right now.";
const CALENDAR_DOWN_REPLY =
  "I couldn't reach Shubham's calendar just now. Please try again in a moment.";
const HOST_EMAIL_NOTE = "That's Shubham's own email address, so the invite can't go there.";
const ASK_DAY_REPLY =
  "Happy to set up a 15-minute call with Shubham. Which day works for you? You can say tomorrow, a weekday, or a date.";
const UNKNOWN_DAY_REPLY =
  "I couldn't tell which day you mean. Try tomorrow, a weekday like Friday, or a date like Oct 21.";
const BOOKING_RETRY_REPLY =
  "I couldn't complete the booking just now. Reply yes to try again, or cancel to stop.";

function finish(state: SchedulingState, reply: string, deps: SchedulingDeps): SchedulingResult {
  return { state: { ...state, updatedAt: deps.now.toISOString() }, reply };
}

function sentence(notes: string[], text: string) {
  return [...notes, text].filter(Boolean).join(" ");
}

function dayOf(start: string) {
  return dateKeyInZone(new Date(start), CALENDAR_TIME_ZONE);
}

function slotWhen(slot: OfferedSlot) {
  return `${formatDateKey(dayOf(slot.start))} at ${slot.label}`;
}

function slotList(slots: OfferedSlot[]) {
  return slots.map((slot, index) => `${index + 1}. ${slot.label}`).join("\n");
}

function confirmationQuestion(slot: OfferedSlot, attendee: Attendee) {
  return `I'll book ${slotWhen(slot)} IST for ${attendee.name} (${attendee.email}). Shall I go ahead?`;
}

function bookedReply(booking: BookingConfirmation) {
  const time = formatTimeInZone(new Date(booking.start), CALENDAR_TIME_ZONE);
  const when = `${formatDateKey(dayOf(booking.start))} at ${time} IST`;
  const link = booking.meetingUrl ? `\nMeeting link: ${booking.meetingUrl}` : "";
  return `You're booked with Shubham on ${when}. The invite is on its way to ${booking.attendeeEmail}.${link}`;
}

function hasPassed(slot: OfferedSlot, deps: SchedulingDeps) {
  return Date.parse(slot.start) <= deps.now.getTime();
}

function attendeeOf(state: SchedulingState): Attendee | null {
  return state.name && state.email ? { name: state.name, email: state.email } : null;
}

function isStale(state: SchedulingState, now: Date) {
  const age = now.getTime() - Date.parse(state.updatedAt);
  return ACTIVE_STEPS.has(state.step) && age > STALE_AFTER_MS;
}

function isAcknowledgement(text: string) {
  return YES_PATTERN.test(text) || NO_PATTERN.test(text);
}

function completeGmailAddresses(text: string) {
  return text.replace(
    GMAIL_USERNAME_PATTERN,
    (match, address?: string, username?: string) =>
      normalizeEmailCandidate(address ?? username ?? "") || match
  );
}

function readName(text: string, expectingName: boolean) {
  if (!expectingName && !NAME_CUE_PATTERN.test(text)) return null;
  const name = extractName(text)?.trim();
  return name && name.length <= MAX_NAME_LENGTH ? name : null;
}

function readContact(
  state: SchedulingState,
  text: string,
  rest: string,
  pickedTime: boolean
): ContactUpdate {
  const email = extractLatestEmail(text);
  const hostEmail = Boolean(email && isHostEmail(email));
  const expectingName =
    !state.name &&
    (Boolean(email) ||
      (state.step === "awaiting_details" && !pickedTime && !isAcknowledgement(rest.trim())));
  const name = readName(text, expectingName);
  const nameChanged = Boolean(name && name !== state.name);
  const emailChanged = Boolean(email && !hostEmail && email !== state.email);

  return {
    state: {
      ...state,
      name: nameChanged ? name : state.name,
      email: hostEmail ? null : emailChanged ? email : state.email,
      emailConfirmed: hostEmail || emailChanged ? false : state.emailConfirmed
    },
    notes: hostEmail ? [HOST_EMAIL_NOTE] : [],
    nameGiven: nameChanged,
    changed: nameChanged || emailChanged || hostEmail
  };
}

function detailsQuestion(state: SchedulingState, notes: string[], lead: string) {
  const question =
    !state.name && !state.email
      ? "What name and email should the invite go to?"
      : !state.email
        ? "What email should the invite go to?"
        : "What name should I put on the invite?";
  return sentence([lead, ...notes], question);
}

function continueWithSlot(
  state: SchedulingState,
  slot: OfferedSlot,
  notes: string[],
  deps: SchedulingDeps
) {
  const selected: SchedulingState = { ...state, selectedSlotId: slot.id };
  const attendee = attendeeOf(selected);

  if (!attendee) {
    const lead = `Great, ${slotWhen(slot)} IST it is.`;
    return finish(
      { ...selected, step: "awaiting_details" },
      detailsQuestion(selected, notes, lead),
      deps
    );
  }

  return finish(
    { ...selected, step: "awaiting_confirmation" },
    sentence(notes, confirmationQuestion(slot, attendee)),
    deps
  );
}

async function offerDay(
  state: SchedulingState,
  dateKey: string,
  deps: SchedulingDeps,
  options: { text?: string; notes?: string[]; excludeSlotId?: string } = {}
): Promise<SchedulingResult> {
  const notes = options.notes ?? [];
  const day = formatDateKey(dateKey);
  const cleared: SchedulingState = {
    ...state,
    dateKey,
    offeredSlots: [],
    selectedSlotId: null,
    booking: null
  };

  if (dateKey < dateKeyInZone(deps.now, CALENDAR_TIME_ZONE)) {
    return finish(
      { ...cleared, dateKey: null, step: "awaiting_day" },
      sentence(notes, `${day} has already passed. Which upcoming day works for you?`),
      deps
    );
  }

  const window = options.text ? extractPreferredTimeWindow(options.text) : null;
  let slots: OfferedSlot[];
  try {
    deps.onStage("checking_calendar");
    slots = await deps.findSlots(dateKey, window ? options.text : undefined);
  } catch (error) {
    if (error instanceof BookingError && error.reason === "not_configured") {
      return finish(initialSchedulingState(), NOT_CONNECTED_REPLY, deps);
    }
    console.error("Calendar availability lookup failed.", error);
    // A snapshot with a dateKey and no slots means "nothing open that day" to the client.
    return finish(
      { ...cleared, dateKey: null, step: "awaiting_day" },
      sentence(notes, CALENDAR_DOWN_REPLY),
      deps
    );
  }

  slots = slots.filter((slot) => slot.id !== options.excludeSlotId && !hasPassed(slot, deps));
  if (!slots.length) {
    return finish(
      { ...cleared, step: "awaiting_day" },
      sentence(notes, `Shubham has no open 15-minute slots on ${day}. Which other day works?`),
      deps
    );
  }

  const offered: SchedulingState = { ...cleared, offeredSlots: slots };
  const picked = window?.exact ? selectSlot(window.text, slots) : undefined;
  if (picked) return continueWithSlot(offered, picked, notes, deps);

  const intro = window?.exact
    ? `That time isn't open on ${day}. Here's what is (IST):`
    : `Here's what's open on ${day} (IST):`;
  const question = "Which one works? Reply with its number or the time.";
  return finish(
    { ...offered, step: "awaiting_slot" },
    sentence(notes, `${intro}\n${slotList(slots)}\n\n${question}`),
    deps
  );
}

async function book(
  state: SchedulingState,
  slot: OfferedSlot,
  attendee: Attendee,
  deps: SchedulingDeps
): Promise<SchedulingResult> {
  const confirmed: SchedulingState = {
    ...state,
    ...attendee,
    selectedSlotId: slot.id,
    emailConfirmed: true
  };

  // Offered slots can sit in the state for up to a day.
  if (hasPassed(slot, deps)) {
    const day = dayOf(slot.start);
    const today = dateKeyInZone(deps.now, CALENDAR_TIME_ZONE);
    return offerDay(confirmed, day, deps, {
      notes: day === today ? [`Sorry, ${slot.label} has already passed.`] : [],
      excludeSlotId: slot.id
    });
  }

  deps.onStage("booking");
  try {
    const booking = await deps.book({ slot, ...attendee });
    return finish(
      { ...confirmed, step: "booked", offeredSlots: [], selectedSlotId: null, booking },
      bookedReply(booking),
      deps
    );
  } catch (error) {
    if (error instanceof BookingError) return bookingFailed(confirmed, slot, error, deps);
    console.error("Interview booking failed.", error);
    return finish({ ...confirmed, step: "awaiting_confirmation" }, BOOKING_RETRY_REPLY, deps);
  }
}

async function bookingFailed(
  state: SchedulingState,
  slot: OfferedSlot,
  error: BookingError,
  deps: SchedulingDeps
): Promise<SchedulingResult> {
  if (error.reason === "slot_unavailable") {
    return offerDay(state, dayOf(slot.start), deps, {
      notes: [`Sorry, ${slotWhen(slot)} was just taken.`],
      excludeSlotId: slot.id
    });
  }
  if (error.reason === "not_configured") {
    return finish(initialSchedulingState(), NOT_CONNECTED_REPLY, deps);
  }
  if (error.reason === "limit_reached") {
    return finish(initialSchedulingState(), error.userMessage, deps);
  }
  if (error.reason === "unknown") {
    return finish({ ...state, step: "awaiting_confirmation" }, BOOKING_RETRY_REPLY, deps);
  }

  const withoutEmail: SchedulingState = { ...state, email: null, emailConfirmed: false };
  return finish(
    { ...withoutEmail, step: "awaiting_details" },
    detailsQuestion(withoutEmail, [error.userMessage], ""),
    deps
  );
}

function cancel(state: SchedulingState, deps: SchedulingDeps) {
  if (state.step === "booked" && state.booking) {
    const when = formatDateKey(dayOf(state.booking.start));
    return finish(
      state,
      `Your call on ${when} is already booked. To cancel or reschedule it, use the link in your calendar invite.`,
      deps
    );
  }
  return finish(
    initialSchedulingState(),
    "Okay, I've stopped the booking. Just ask whenever you'd like to pick a time.",
    deps
  );
}

async function bookFromAction(
  state: SchedulingState,
  action: Extract<ChatAction, { type: "book" }>,
  deps: SchedulingDeps
) {
  // A repeated book action (a double click, a retry) must not book a second call.
  if (state.step === "booked" && state.booking) {
    return finish(state, bookedReply(state.booking), deps);
  }

  const slot = state.offeredSlots.find((offered) => offered.id === action.slotId);
  if (!slot && !state.offeredSlots.length) {
    return finish(
      { ...state, step: "awaiting_day" },
      "That time is no longer on offer. Which day should I check?",
      deps
    );
  }
  if (!slot) {
    const slots = slotList(state.offeredSlots);
    return finish(state, `That time is no longer on offer. Pick one of these (IST):\n${slots}`, deps);
  }

  const name = action.name.trim();
  const email = action.email.trim().toLowerCase();
  if (!name || name.length > MAX_NAME_LENGTH) {
    return finish(state, `Please enter your name (up to ${MAX_NAME_LENGTH} characters).`, deps);
  }
  // Keep the chosen time and name, so only the email has to be entered again.
  const named: SchedulingState = { ...state, name, selectedSlotId: slot.id };
  if (!emailSchema.safeParse(email).success) {
    return finish(
      named,
      "That email address doesn't look right. Please check it and try again.",
      deps
    );
  }
  if (isHostEmail(email)) {
    return finish(named, sentence([HOST_EMAIL_NOTE], "Please use your own email address."), deps);
  }

  return book(state, slot, { name, email }, deps);
}

async function handleMessage(
  state: SchedulingState,
  text: string,
  deps: SchedulingDeps
): Promise<SchedulingResult> {
  const base: SchedulingState =
    state.step === "idle" || state.step === "booked"
      ? { ...initialSchedulingState(), name: state.name, email: state.email }
      : state;
  const contactText = completeGmailAddresses(text);
  const rest = contactText.replace(EMAIL_TOKEN_PATTERN, " ");
  const dateKey = extractTargetDateKey(rest, { now: deps.now, timeZone: CALENDAR_TIME_ZONE });
  const window = extractPreferredTimeWindow(rest);
  if (state.booking && !dateKey && !window && isAcknowledgement(rest.trim())) {
    return finish(state, bookedReply(state.booking), deps);
  }

  const picked =
    selectSlot(rest, base.offeredSlots) ??
    (window?.exact ? selectSlot(window.text, base.offeredSlots) : undefined);
  const contact = readContact(base, contactText, rest, Boolean(dateKey || picked || window));
  const next = contact.state;
  const notes = contact.notes;
  const choosingDay =
    base.step === "idle" || base.step === "awaiting_day" || !base.offeredSlots.length;

  if (dateKey && (choosingDay || dateKey !== base.dateKey)) {
    return offerDay(next, dateKey, deps, { text: rest, notes });
  }

  if (choosingDay) {
    const reply =
      base.step === "idle"
        ? ASK_DAY_REPLY
        : contact.changed
          ? `Thanks${contact.nameGiven ? `, ${next.name}` : ""}. Which day works for the call?`
          : UNKNOWN_DAY_REPLY;
    return finish({ ...next, step: "awaiting_day" }, sentence(notes, reply), deps);
  }

  if (!picked && window && base.dateKey) {
    return offerDay(next, base.dateKey, deps, { text: rest, notes });
  }

  const slot =
    picked ?? base.offeredSlots.find((offered) => offered.id === base.selectedSlotId);
  const lead = contact.nameGiven ? `Thanks, ${next.name}.` : "";
  if (!slot) {
    const question = `Which time works? Reply with its number:\n${slotList(next.offeredSlots)}`;
    return finish({ ...next, step: "awaiting_slot" }, sentence([lead, ...notes], question), deps);
  }

  const slotChanged = slot.id !== base.selectedSlotId;
  if (slotChanged) return continueWithSlot(next, slot, notes, deps);

  const attendee = attendeeOf(next);
  if (!attendee) {
    return finish({ ...next, step: "awaiting_details" }, detailsQuestion(next, notes, lead), deps);
  }

  if (base.step === "awaiting_details" || contact.changed) {
    const updated = base.step === "awaiting_confirmation" ? "Updated." : "";
    return finish(
      { ...next, step: "awaiting_confirmation" },
      sentence([...notes, updated], confirmationQuestion(slot, attendee)),
      deps
    );
  }

  const answer = rest.trim();
  if (YES_PATTERN.test(answer)) return book(next, slot, attendee, deps);
  if (NO_PATTERN.test(answer)) {
    return finish(
      next,
      "No problem. Tell me what to change (the time, your name or your email), or say cancel to stop.",
      deps
    );
  }
  const booking = `${slotWhen(slot)} IST for ${attendee.name} (${attendee.email})`;
  return finish(next, `Reply yes to book ${booking}, or tell me what to change.`, deps);
}

export async function advanceScheduling(
  state: SchedulingState,
  input: SchedulingInput,
  deps: SchedulingDeps
): Promise<SchedulingResult> {
  const current = isStale(state, deps.now) ? initialSchedulingState(deps.now) : state;

  if (input.kind === "cancel") return cancel(current, deps);
  if (!isCalendarConfigured()) return finish(initialSchedulingState(), NOT_CONNECTED_REPLY, deps);
  if (input.kind === "message") return handleMessage(current, input.text, deps);
  if (input.action.type === "check_day") {
    return offerDay(current, input.action.dateKey, deps);
  }
  return bookFromAction(current, input.action, deps);
}
