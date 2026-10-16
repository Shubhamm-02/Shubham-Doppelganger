"use client";

import type { OfferedSlot } from "@/lib/chat/types";
import { formatLocalTimeLabel, localTimeFor, useVisitorTimeZone } from "@/components/booking/slot-time";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { cx } from "@/lib/client/cx";
import { formatDayHeader, formatIstTime, formatZoneName, istDateKey, shiftDateKey } from "@/lib/client/format-time";

const shortDay = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });

function weekday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

function nextWeekday(dateKey: string) {
  let next = shiftDateKey(dateKey, 1);
  while (weekday(next) === 0 || weekday(next) === 6) next = shiftDateKey(next, 1);
  return next;
}

export function checkDayText(dateKey: string) {
  return `Show ${formatDayHeader(dateKey)}`;
}

export type SlotPickerProps = {
  dateKey: string;
  slots: OfferedSlot[];
  selectedSlotId: string | null;
  interactive: boolean;
  pendingDateKey: string | null;
  focusSlotId?: string | null;
  onSelect?(slot: OfferedSlot): void;
  onCheckDay(dateKey: string): void;
};

export function SlotPicker({
  dateKey,
  slots,
  selectedSlotId,
  interactive,
  pendingDateKey,
  focusSlotId = null,
  onSelect,
  onCheckDay
}: SlotPickerProps) {
  const timeZone = useVisitorTimeZone();
  const today = istDateKey();
  const previous = shiftDateKey(dateKey, -1);
  const next = shiftDateKey(dateKey, 1);
  const busy = pendingDateKey !== null;
  const localZone = slots.length > 0 && localTimeFor(slots[0].start, timeZone) ? formatZoneName(slots[0].start, timeZone) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-baseline gap-2 text-14 font-medium text-fg">
            {formatDayHeader(dateKey)}
            <span className="font-mono text-12 font-normal text-fg-subtle">IST</span>
          </h3>
          {localZone ? <p className="mt-0.5 text-12 text-fg-subtle">Your time ({localZone}) below each slot</p> : null}
        </div>
        {interactive ? (
          <div className="-my-1 -mr-1 flex shrink-0 items-center">
            <IconButton
              size="sm"
              label={`Previous day, ${formatDayHeader(previous)}`}
              icon={<ChevronLeftIcon />}
              disabled={previous < today || (busy && pendingDateKey !== previous)}
              disabledReason={previous < today ? "Earlier days have passed" : undefined}
              pending={pendingDateKey === previous}
              onClick={() => onCheckDay(previous)}
            />
            <IconButton
              size="sm"
              label={`Next day, ${formatDayHeader(next)}`}
              icon={<ChevronRightIcon />}
              disabled={busy && pendingDateKey !== next}
              pending={pendingDateKey === next}
              onClick={() => onCheckDay(next)}
            />
          </div>
        ) : null}
      </div>

      {slots.length > 0 ? (
        <ul
          className={cx("grid gap-2 sm:grid-cols-4", slots.length === 4 ? "grid-cols-2" : "grid-cols-3")} aria-label={`Open times on ${formatDayHeader(dateKey)}, India Standard Time`}>
          {slots.map((slot) => (
            <li key={slot.id}>
              <SlotButton
                slot={slot}
                timeZone={timeZone}
                selected={slot.id === selectedSlotId}
                interactive={interactive}
                disabled={busy}
                autoFocus={slot.id === focusSlotId}
                onSelect={onSelect}
              />
            </li>
          ))}
        </ul>
      ) : (
        <NoSlots dateKey={dateKey} interactive={interactive} pendingDateKey={pendingDateKey} onCheckDay={onCheckDay} />
      )}
    </div>
  );
}

type SlotButtonProps = {
  slot: OfferedSlot;
  timeZone: string;
  selected: boolean;
  interactive: boolean;
  disabled: boolean;
  autoFocus: boolean;
  onSelect?(slot: OfferedSlot): void;
};

function SlotButton({ slot, timeZone, selected, interactive, disabled, autoFocus, onSelect }: SlotButtonProps) {
  const ist = formatIstTime(slot.start);
  const local = localTimeFor(slot.start, timeZone);
  const label = local ? `${ist} IST, ${formatLocalTimeLabel(local)} your time` : `${ist} IST`;
  const content = (
    <>
      <span className="text-14 font-medium">{ist}</span>
      {local ? (
        <span className={cx("text-12", selected && interactive ? "text-accent-fg/80" : "text-fg-subtle")}>
          {local.weekday ? `${local.weekday} ` : null}
          {local.time}
        </span>
      ) : null}
    </>
  );
  const shape = "flex min-h-10 w-full flex-col items-center justify-center rounded-md px-2 py-1.5 tabular-nums";

  if (!interactive) {
    return (
      <span
        aria-label={selected ? `${label}, chosen` : label}
        className={cx(shape, selected ? "bg-sunken text-fg shadow-sm" : "text-fg-subtle shadow-[0_0_0_1px_var(--color-border)]")}
      >
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected}
      disabled={disabled}
      autoFocus={autoFocus}
      onClick={() => onSelect?.(slot)}
      className={cx(
        shape,
        "transition-[background-color,color,box-shadow,opacity] duration-(--duration-fast) ease-out disabled:cursor-not-allowed disabled:opacity-50",
        selected ? "bg-accent text-accent-fg shadow-xs" : "bg-surface text-fg shadow-sm hover:bg-sunken"
      )}
    >
      {content}
    </button>
  );
}

type NoSlotsProps = {
  dateKey: string;
  interactive: boolean;
  pendingDateKey: string | null;
  onCheckDay(dateKey: string): void;
};

function NoSlots({ dateKey, interactive, pendingDateKey, onCheckDay }: NoSlotsProps) {
  const suggestion = nextWeekday(dateKey);

  return (
    <div className="flex flex-col items-start gap-3 rounded-md bg-sunken px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-13 text-fg-muted">No open times on {formatDayHeader(dateKey).split(",")[0]}.</p>
      {interactive ? (
        <Button
          size="sm"
          pending={pendingDateKey === suggestion}
          disabled={pendingDateKey !== null && pendingDateKey !== suggestion}
          onClick={() => onCheckDay(suggestion)}
        >
          {checkDayText(suggestion)}
          <ChevronRightIcon className="-mr-1" />
        </Button>
      ) : null}
    </div>
  );
}

export type QuickDaysProps = {
  interactive: boolean;
  pendingDateKey: string | null;
  onCheckDay(dateKey: string): void;
};

export function QuickDays({ interactive, pendingDateKey, onCheckDay }: QuickDaysProps) {
  const today = istDateKey();
  const tomorrow = shiftDateKey(today, 1);
  const days = [
    { key: today, label: "Today" },
    { key: tomorrow, label: "Tomorrow" }
  ];
  let cursor = tomorrow;
  while (days.length < 5) {
    cursor = nextWeekday(cursor);
    days.push({ key: cursor, label: shortDay.format(new Date(`${cursor}T00:00:00Z`)) });
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-14 font-medium text-fg">Pick a day</h3>
        <p className="mt-0.5 text-12 text-fg-subtle">15-minute calls, times in IST</p>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Days">
        {days.map((day) => (
          <li key={day.key}>
            <Button
              size="sm"
              className="tabular-nums"
              disabled={!interactive || (pendingDateKey !== null && pendingDateKey !== day.key)}
              pending={pendingDateKey === day.key}
              aria-label={day.label === "Today" || day.label === "Tomorrow" ? `${day.label}, ${formatDayHeader(day.key)}` : formatDayHeader(day.key)}
              onClick={() => onCheckDay(day.key)}
            >
              {day.label}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
