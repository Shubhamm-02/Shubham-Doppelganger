"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { ChatAction, OfferedSlot, SchedulingSnapshot } from "@/lib/chat/types";
import { BookingCard } from "@/components/booking/booking-card";
import { BookingForm, type BookingDetails } from "@/components/booking/booking-form";
import { BookingReview } from "@/components/booking/booking-review";
import { checkDayText, QuickDays, SlotPicker } from "@/components/booking/slot-picker";
import { formatLocalTimeLabel, formatSlotDay, formatSlotLabel, localTimeFor, useVisitorTimeZone } from "@/components/booking/slot-time";
import { Button } from "@/components/ui/button";
import { ClockIcon } from "@/components/ui/icons";
import { cx } from "@/lib/client/cx";
import { formatIstTime, istDateKey } from "@/lib/client/format-time";
import { rise } from "@/lib/client/motion";

export type SchedulingBlockProps = {
  snapshot: SchedulingSnapshot;
  interactive: boolean;
  busy?: boolean;
  onAction(action: ChatAction, displayText: string): void;
};

type Pending = { type: "check_day"; dateKey: string } | { type: "book" } | null;

export function SchedulingBlock({ snapshot, interactive, busy = false, onAction }: SchedulingBlockProps) {
  const [pending, setPending] = useState<Pending>(null);
  const [settled, setSettled] = useState({ busy, interactive });

  if (settled.busy !== busy || settled.interactive !== interactive) {
    setSettled({ busy, interactive });
    if ((settled.busy && !busy) || (!settled.interactive && interactive)) setPending(null);
  }

  function checkDay(dateKey: string) {
    setPending({ type: "check_day", dateKey });
    onAction({ type: "check_day", dateKey }, checkDayText(dateKey));
  }

  function book(slot: OfferedSlot, details: BookingDetails) {
    setPending({ type: "book" });
    onAction({ type: "book", slotId: slot.id, ...details }, `Book ${formatSlotLabel(slot.start)}`);
  }

  const pendingDateKey = pending?.type === "check_day" ? pending.dateKey : null;

  if (snapshot.step === "booked") {
    return snapshot.booking ? <BookingCard booking={snapshot.booking} /> : null;
  }

  let content: React.ReactNode = null;
  if (snapshot.step === "awaiting_slot") {
    content = (
      <SlotFlow
        snapshot={snapshot}
        interactive={interactive}
        pendingDateKey={pendingDateKey}
        booking={pending?.type === "book"}
        onCheckDay={checkDay}
        onBook={book}
      />
    );
  } else if (snapshot.step === "awaiting_day") {
    content = snapshot.dateKey ? (
      <SlotPicker
        dateKey={snapshot.dateKey}
        slots={[]}
        selectedSlotId={null}
        interactive={interactive}
        pendingDateKey={pendingDateKey}
        onCheckDay={checkDay}
      />
    ) : (
      <QuickDays interactive={interactive} pendingDateKey={pendingDateKey} onCheckDay={checkDay} />
    );
  } else if (snapshot.step === "awaiting_details" || snapshot.step === "awaiting_confirmation") {
    const chosen = snapshot.slots.find((slot) => slot.id === snapshot.selectedSlotId);
    if (chosen) content = <SlotSummary step={snapshot.step} slot={chosen} attendee={snapshot.attendee} />;
  }

  if (!content) return null;

  return (
    <div className={cx("rounded-lg p-3 sm:p-4", interactive ? "bg-surface shadow-sm" : "shadow-[0_0_0_1px_var(--color-border)]")}>
      {content}
    </div>
  );
}

type SlotFlowProps = {
  snapshot: SchedulingSnapshot;
  interactive: boolean;
  pendingDateKey: string | null;
  booking: boolean;
  onCheckDay(dateKey: string): void;
  onBook(slot: OfferedSlot, details: BookingDetails): void;
};

type View = { step: "pick"; focusSlotId: string | null } | { step: "details" } | { step: "review" };

function SlotFlow({ snapshot, interactive, pendingDateKey, booking, onCheckDay, onBook }: SlotFlowProps) {
  const [slotId, setSlotId] = useState(() =>
    snapshot.slots.some((slot) => slot.id === snapshot.selectedSlotId) ? snapshot.selectedSlotId : null
  );
  // A rejected email comes back with the chosen time and name kept, so the form opens again to fix it.
  const [view, setView] = useState<View>(() =>
    slotId && snapshot.attendee.name ? { step: "details" } : { step: "pick", focusSlotId: null }
  );
  const [details, setDetails] = useState<BookingDetails>({
    name: snapshot.attendee.name ?? "",
    email: snapshot.attendee.email ?? ""
  });
  const slot = snapshot.slots.find((candidate) => candidate.id === slotId) ?? null;
  const dateKey = snapshot.dateKey ?? (snapshot.slots[0] ? istDateKey(snapshot.slots[0].start) : istDateKey());
  const step = interactive && slot ? view.step : "pick";

  // Once the conversation has moved on, a chosen time collapses to one line instead of the full grid.
  if (!interactive && slot) return <ChosenSlot slot={slot} />;

  return (
    <div className="relative">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div key={step} {...rise}>
          {step === "pick" || !slot ? (
            <SlotPicker
              dateKey={dateKey}
              slots={snapshot.slots}
              selectedSlotId={slotId}
              interactive={interactive}
              pendingDateKey={pendingDateKey}
              focusSlotId={view.step === "pick" ? view.focusSlotId : null}
              onCheckDay={onCheckDay}
              onSelect={(next) => {
                setSlotId(next.id);
                setView({ step: "details" });
              }}
            />
          ) : step === "details" ? (
            <div className="flex flex-col gap-4">
              <ChosenSlot slot={slot} onChange={() => setView({ step: "pick", focusSlotId: slot.id })} />
              <BookingForm
                initial={details}
                onSubmit={(next) => {
                  setDetails(next);
                  setView({ step: "review" });
                }}
              />
            </div>
          ) : (
            <BookingReview
              slot={slot}
              details={details}
              pending={booking}
              onEdit={() => setView({ step: "details" })}
              onConfirm={() => onBook(slot, details)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ChosenSlot({ slot, onChange }: { slot: OfferedSlot; onChange?(): void }) {
  const timeZone = useVisitorTimeZone();
  const local = localTimeFor(slot.start, timeZone);

  return (
    <div className={cx("flex items-center justify-between gap-3", onChange && "border-b border-border pb-3")}>
      <div className="flex min-w-0 items-center gap-2.5">
        <ClockIcon className="shrink-0 text-fg-subtle" />
        <p className="min-w-0 text-14 tabular-nums">
          <span className="font-medium text-fg">
            {formatSlotDay(slot.start)} · {formatIstTime(slot.start)} IST
          </span>
          {local ? <span className="block text-12 text-fg-subtle sm:ml-2 sm:inline">{formatLocalTimeLabel(local)}</span> : null}
        </p>
      </div>
      {onChange ? (
        <Button variant="ghost" size="sm" onClick={onChange}>
          Change
        </Button>
      ) : null}
    </div>
  );
}

type SlotSummaryProps = {
  step: "awaiting_details" | "awaiting_confirmation";
  slot: OfferedSlot;
  attendee: SchedulingSnapshot["attendee"];
};

function SlotSummary({ step, slot, attendee }: SlotSummaryProps) {
  const timeZone = useVisitorTimeZone();
  const local = localTimeFor(slot.start, timeZone);
  const guest = [attendee.name, attendee.email].filter(Boolean).join(" · ");

  return (
    <div className="flex items-start gap-2.5">
      <ClockIcon className="mt-0.5 shrink-0 text-fg-subtle" />
      <div className="min-w-0 flex-1">
        <p className="font-mono text-12 text-fg-subtle">{step === "awaiting_details" ? "Selected time" : "Waiting for your go-ahead"}</p>
        <p className="mt-1 text-14 font-medium text-fg tabular-nums">
          {formatSlotDay(slot.start)} · {formatIstTime(slot.start)} IST
          {local ? <span className="ml-2 font-normal text-fg-subtle">{formatLocalTimeLabel(local)}</span> : null}
        </p>
        {guest ? <p className="mt-0.5 truncate text-13 text-fg-muted">{guest}</p> : null}
      </div>
    </div>
  );
}
