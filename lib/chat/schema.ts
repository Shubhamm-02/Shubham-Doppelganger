import { z } from "zod";
import { isValidDateKey } from "@/lib/calendar/dates";

const MAX_MESSAGE_LENGTH = 2000;
const MAX_NAME_LENGTH = 100;
const MAX_EMAIL_LENGTH = 254;
const SESSION_ID_ERROR = "sessionId must be a positive integer.";
const REPLACE_TURN_ID_ERROR = "replaceTurnId must be a positive integer.";
const DATE_KEY_ERROR = "action.dateKey must be a date in YYYY-MM-DD format.";
const REGENERATE_ACTION_ERROR = "replaceTurnId cannot be combined with action.";

const checkDayActionSchema = z.object({
  type: z.literal("check_day"),
  dateKey: z.string({ error: DATE_KEY_ERROR }).refine(isValidDateKey, DATE_KEY_ERROR)
});

const bookActionSchema = z.object({
  type: z.literal("book"),
  slotId: z
    .string({ error: "action.slotId must be a string." })
    .min(1, "action.slotId cannot be empty."),
  name: z
    .string({ error: "action.name must be a string." })
    .max(MAX_NAME_LENGTH, `action.name must be ${MAX_NAME_LENGTH} characters or fewer.`),
  email: z
    .string({ error: "action.email must be a string." })
    .max(MAX_EMAIL_LENGTH, `action.email must be ${MAX_EMAIL_LENGTH} characters or fewer.`)
});

export const chatRequestSchema = z
  .object(
    {
      message: z
        .string({ error: "Message must be a string." })
        .trim()
        .min(1, "Message cannot be empty.")
        .max(MAX_MESSAGE_LENGTH, `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`),
      sessionId: z
        .number({ error: SESSION_ID_ERROR })
        .int(SESSION_ID_ERROR)
        .positive(SESSION_ID_ERROR)
        .optional(),
      action: z
        .discriminatedUnion("type", [checkDayActionSchema, bookActionSchema], {
          error: "action.type must be check_day or book."
        })
        .optional(),
      replaceTurnId: z
        .number({ error: REPLACE_TURN_ID_ERROR })
        .int(REPLACE_TURN_ID_ERROR)
        .positive(REPLACE_TURN_ID_ERROR)
        .optional()
    },
    { error: "Request body must be a JSON object." }
  )
  .refine((body) => body.action === undefined || body.replaceTurnId === undefined, {
    error: REGENERATE_ACTION_ERROR
  });

export type ChatRequest = z.infer<typeof chatRequestSchema>;
