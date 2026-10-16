export const CALENDAR_TIME_ZONE = "Asia/Kolkata";

export function eventTypeId() {
  const value = Number(process.env.CAL_EVENT_TYPE_ID?.trim());
  return Number.isInteger(value) && value > 0 ? value : null;
}

export function isCalendarConfigured() {
  return Boolean(process.env.CAL_API_KEY?.trim() && eventTypeId());
}
