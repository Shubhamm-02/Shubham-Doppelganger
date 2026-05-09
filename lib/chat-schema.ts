import { z } from "zod";

export const chatRequestSchema = z.object({
  message: z.string(),
  sessionId: z.number().int().positive().optional(),
  schedulingMode: z.boolean().optional(),
  schedulingContext: z.string().optional()
});
