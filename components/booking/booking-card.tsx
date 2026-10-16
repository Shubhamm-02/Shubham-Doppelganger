"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { BookingConfirmation } from "@/lib/chat/types";
import { localTimeFor, useVisitorTimeZone } from "@/components/booking/slot-time";
import { Button } from "@/components/ui/button";
import { CalendarIcon, CheckIcon, CopyIcon, ExternalIcon } from "@/components/ui/icons";
import { bookingToIcs, ICS_FILE_NAME, icsDataUrl } from "@/lib/client/ics";
import { formatDayHeader, formatIstTime, formatLocalTime, formatZoneName, istDateKey } from "@/lib/client/format-time";

function formatRange(start: string, end: string, format: (iso: string) => string) {
  const from = format(start);
  const to = format(end);
  const meridiem = / [AP]M$/;
  const sameHalf = from.match(meridiem)?.[0] === to.match(meridiem)?.[0];
  return `${sameHalf ? from.replace(meridiem, "") : from}–${to}`;
}

function minutesBetween(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60_000);
}

function linkLabel(url: string) {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

export type BookingCardProps = { booking: BookingConfirmation };

export function BookingCard({ booking }: BookingCardProps) {
  const timeZone = useVisitorTimeZone();
  const [copied, setCopied] = useState(false);

  const day = formatDayHeader(istDateKey(booking.start));
  const istRange = `${formatRange(booking.start, booking.end, formatIstTime)} IST`;
  const local = localTimeFor(booking.start, timeZone);
  const localRange = local
    ? `${local.weekday ? `${local.weekday} ` : ""}${formatRange(booking.start, booking.end, (iso) => formatLocalTime(iso, timeZone))} ${formatZoneName(booking.start, timeZone)}`
    : null;
  const minutes = minutesBetween(booking.start, booking.end);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  function downloadCalendarFile() {
    const link = document.createElement("a");
    link.href = icsDataUrl(bookingToIcs(booking, new Date()));
    link.download = ICS_FILE_NAME;
    link.click();
  }

  async function copyDetails() {
    const lines = [
      "Interview with Shubham Shah",
      `${day} · ${istRange}${localRange ? ` (${localRange})` : ""}`,
      `${booking.attendeeName} <${booking.attendeeEmail}>`
    ];
    if (booking.meetingUrl) lines.push(booking.meetingUrl);
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopied(true);
      toast("Booking details copied");
    } catch {
      toast("Couldn't copy. Select the details and copy them instead.");
    }
  }

  return (
    <section aria-label="Booking confirmed" className="overflow-hidden rounded-lg bg-surface shadow-sm">
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <span className="grid size-8 shrink-0 animate-pop-in place-items-center rounded-full bg-success/10 text-success">
          <CheckIcon />
        </span>
        <div className="min-w-0">
          <h3 className="text-15 font-medium text-fg">You&apos;re booked with Shubham</h3>
          <p className="text-13 text-fg-muted">{minutes}-minute call</p>
        </div>
      </div>
      <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-border px-4 py-3 text-14">
        <dt className="font-mono text-12 leading-5 text-fg-subtle">Date</dt>
        <dd className="text-fg">{day}</dd>
        <dt className="font-mono text-12 leading-5 text-fg-subtle">Time</dt>
        <dd className="tabular-nums text-fg">{istRange}</dd>
        {localRange ? (
          <>
            <dt className="font-mono text-12 leading-5 text-fg-subtle">Your time</dt>
            <dd className="tabular-nums text-fg-muted">{localRange}</dd>
          </>
        ) : null}
        <dt className="font-mono text-12 leading-5 text-fg-subtle">Guest</dt>
        <dd className="min-w-0">
          <span className="block truncate text-fg">{booking.attendeeName}</span>
          <span className="block truncate text-13 text-fg-muted">{booking.attendeeEmail}</span>
        </dd>
        {booking.meetingUrl ? (
          <>
            <dt className="font-mono text-12 leading-5 text-fg-subtle">Link</dt>
            <dd className="min-w-0">
              <a
                href={booking.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 rounded-sm text-accent underline-offset-2 hover:underline"
              >
                <span className="truncate">{linkLabel(booking.meetingUrl)}</span>
                <ExternalIcon className="shrink-0" />
              </a>
            </dd>
          </>
        ) : null}
      </dl>
      <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
        <Button size="sm" leadingIcon={<CalendarIcon />} onClick={downloadCalendarFile}>
          Add to calendar
        </Button>
        <Button size="sm" variant="ghost" leadingIcon={copied ? <CheckIcon /> : <CopyIcon />} onClick={copyDetails}>
          Copy details
        </Button>
      </div>
    </section>
  );
}
