import { z } from "zod";
import type { SafetyCtx } from "./safety";

// The safety context the browser sends back (taken from the server's own reply metadata).
export const ctxSchema = z
  .object({
    pregnant: z.boolean().optional(),
    mildOnly: z.boolean().optional(),
    minor: z.boolean().optional(),
    allergens: z.array(z.string().max(60)).max(20).optional(),
    allergyUnknown: z.boolean().optional(),
  })
  .optional();

export const toCtx = (c: z.infer<typeof ctxSchema>): SafetyCtx => ({ ...(c ?? {}) });
