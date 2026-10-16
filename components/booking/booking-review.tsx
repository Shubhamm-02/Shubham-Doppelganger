"use client";

import { useEffect, useRef } from "react";
import type { OfferedSlot } from "@/lib/chat/types";
import type { BookingDetails } from "@/components/booking/booking-form";
import { formatLocalTimeLabel, formatSlotDay, localTimeFor, useVisitorTimeZone } from "@/components/booking/slot-time";
import { Button } from "@/components/ui/button";
import { formatIstTime } from "@/lib/client/format-time";

export type BookingReviewProps = {
  slot: OfferedSlot;
  details: BookingDetails;
  pending: boolean;
  onConfirm(): void;
  onEdit(): void;
};

export function BookingReview({ slot, details, pending, onConfirm, onEdit }: BookingReviewProps) {
  const timeZone = useVisitorTimeZone();
  const local = localTimeFor(slot.start, timeZone);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex flex-col gap-4">
      <h3 ref={headingRef} tabIndex={-1} className="text-14 font-medium text-fg outline-none">
        Confirm your call
      </h3>
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-14">
        <dt className="font-mono text-12 leading-5 text-fg-subtle">When</dt>
        <dd className="tabular-nums text-fg">
          {formatSlotDay(slot.start)} · {formatIstTime(slot.start)} IST · 15 min
        </dd>
        {local ? (
          <>
            <dt className="font-mono text-12 leading-5 text-fg-subtle">Your time</dt>
            <dd className="tabular-nums text-fg-muted">{formatLocalTimeLabel(local)}</dd>
          </>
        ) : null}
        <dt className="font-mono text-12 leading-5 text-fg-subtle">Name</dt>
        <dd className="truncate text-fg">{details.name}</dd>
        <dt className="font-mono text-12 leading-5 text-fg-subtle">Email</dt>
        <dd className="truncate text-fg">{details.email}</dd>
      </dl>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" disabled={pending} onClick={onEdit}>
          Edit
        </Button>
        <Button variant="primary" size="sm" pending={pending} onClick={onConfirm}>
          Confirm booking
        </Button>
      </div>
    </div>
  );
}
