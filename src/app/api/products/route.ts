import { z } from "zod";
import { getProduct } from "@/lib/catalogue";
import { cardFull } from "@/lib/engine";

// Gives the cart page the facts for a list of product IDs (price, photo, sizes and scents, buy link).
// Anything that is not a real, available product is simply left out.
const body = z.object({ ids: z.array(z.string().max(120)).max(40) });

export async function POST(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const products = parsed.data.ids
    .map((id) => getProduct(id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.available && !p.duplicateOf)
    .map((p) => cardFull(p));
  return Response.json({ products });
}
