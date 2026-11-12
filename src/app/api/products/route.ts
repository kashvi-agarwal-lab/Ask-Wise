import { z } from "zod";
import { getProduct } from "@/lib/catalogue";
import { cardFull } from "@/lib/engine";
import { exclusionReason } from "@/lib/safety";
import { ctxSchema, toCtx } from "@/lib/ctx-schema";

// Gives the cart page the facts for a list of product IDs (price, photo, sizes and scents, buy link).
// Anything that is not a real, available product is simply left out. With a safety context, it
// also says which items the app would no longer suggest (the cart itself is never changed).
const body = z.object({ ids: z.array(z.string().max(120)).max(40), ctx: ctxSchema });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const ctx = toCtx(parsed.data.ctx);
  const found = parsed.data.ids
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.available && !p.duplicateOf);
  const flags: Record<string, string> = {};
  if (parsed.data.ctx) for (const p of found) {
    const r = exclusionReason(p, { ...ctx, mildOnly: false });
    if (r) flags[p.id] = r;
  }
  return Response.json({ products: found.map((p) => cardFull(p)), flags });
}
