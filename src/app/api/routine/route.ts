import { z } from "zod";
import { buildRoutine } from "@/lib/engine";

// Rebuilds a routine from a list of product IDs (no AI involved), so adding, removing and
// changing sizes is instant and always exact. The app code checks every ID and does the maths.
const body = z.object({
  pregnant: z.boolean().optional(),
  entries: z
    .array(z.object({ id: z.string().max(120), slots: z.array(z.enum(["am", "pm", "weekly", "supplement"])).optional() }))
    .max(12),
});

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  return Response.json(buildRoutine(parsed.data.entries, { pregnant: parsed.data.pregnant }));
}
