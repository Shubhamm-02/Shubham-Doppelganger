type CalendarResult = {
  configured: boolean;
  message: string;
};

function isCalendarConfigured() {
  return Boolean(process.env.CAL_API_KEY && process.env.CAL_EVENT_TYPE_ID);
}

export async function getAvailability(
  _input: Record<string, unknown>
): Promise<CalendarResult> {
  if (!isCalendarConfigured()) {
    return {
      configured: false,
      message:
        "I can collect the interview details, but live calendar availability is not connected yet."
    };
  }

  return {
    configured: true,
    message: "Calendar configuration exists. Cal.com availability wiring is next."
  };
}

export async function bookInterview(
  _input: Record<string, unknown>
): Promise<CalendarResult> {
  if (!isCalendarConfigured()) {
    return {
      configured: false,
      message:
        "I can collect the interview details, but live calendar booking is not connected yet."
    };
  }

  return {
    configured: true,
    message: "Calendar configuration exists. Cal.com booking wiring is next."
  };
}
