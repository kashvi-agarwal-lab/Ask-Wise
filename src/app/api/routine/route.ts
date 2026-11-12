import { z } from "zod";
import { buildRoutine } from "@/lib/engine";
import { ctxSchema, toCtx } from "@/lib/ctx-schema";

// Rebuilds a routine from a list of product IDs (no AI involved), so adding, removing and
// changing sizes is instant and always exact. The app code checks every ID and does the maths.
const body = z.object({
  pregnant: z.boolean().optional(), // (older clients)
  mildOnly: z.boolean().optional(),
  ctx: ctxSchema,
  entries: z
    .array(z.object({ id: z.string().max(120), slots: z.array(z.enum(["am", "pm", "daily", "alt", "weekly", "supplement"])).optional() }))
    .max(12),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const { ctx, pregnant, mildOnly, entries } = parsed.data;
  return Response.json(buildRoutine(entries, { pregnant, mildOnly, ...toCtx(ctx) }));
}
