// The "app code" role: filters the catalogue, validates product IDs and does the maths.
// The AI never invents products or prices; it can only use what these functions return.
import { visibleProducts, getProduct, concernLabels, pricesAsOf, type Product } from "./catalogue";

export type Slot = "am" | "pm" | "weekly" | "supplement";

/** Short card data: everything the UI needs to draw a product card, taken from the catalogue. */
export function card(p: Product) {
  return {
    id: p.id,
    name: p.displayName,
    size: p.size,
    price: p.price,
    mrp: p.mrp && p.mrp > p.price ? p.mrp : null,
    image: p.image,
    url: p.url,
    category: p.category,
    type: p.type,
    isKit: p.isKit,
    isSupplement: p.isSupplement,
    rating: p.rating ?? null,
    reviewCount: p.reviewCount ?? null,
    tagline: p.tagline ?? null,
    concerns: p.concerns.filter((c) => c.strength === "primary").map((c) => c.label),
    actives: p.actives.map((a) => a.label),
  };
}
/** Card plus the facts shown in the expandable sections (ingredients, how to use, precautions). */
export function cardFull(p: Product) {
  return {
    ...card(p),
    keyIngredients: (p.keyIngredients ?? []).slice(0, 4),
    howToUse: (p.howToUse ?? []).slice(0, 5),
    precautions: (p.precautions ?? []).map((x) => x.text).slice(0, 3),
  };
}
export type ProductCard = ReturnType<typeof cardFull>;

const popularity = (p: Product) => (p.rating ?? 3) * Math.log10((p.reviewCount ?? 0) + 10);

export type SearchInput = {
  concernKeys?: string[];
  category?: string;
  type?: string;
  bodyArea?: string;
  maxPrice?: number;
  text?: string;
  includeKits?: boolean;
  includeSupplements?: boolean;
  excludeIds?: string[];
  limit?: number;
};

export function searchProducts(q: SearchInput) {
  const text = q.text?.toLowerCase().trim();
  const scored = visibleProducts
    .filter((p) => !(p.isKit && !q.includeKits))
    .filter((p) => !(p.isSupplement && !q.includeSupplements && q.category !== "wellness"))
    .filter((p) => !q.category || p.category === q.category)
    .filter((p) => !q.type || p.type === q.type)
    .filter((p) => !q.maxPrice || p.price <= q.maxPrice)
    .filter((p) => !q.excludeIds?.includes(p.id))
    .map((p) => {
      let score = 0;
      for (const key of q.concernKeys ?? []) {
        const c = p.concerns.find((c) => c.key === key);
        if (c) score += c.strength === "primary" ? 3 : 1;
      }
      if (q.bodyArea && p.bodyAreas.some((b) => b.key === q.bodyArea)) score += 1;
      if (text) {
        const hay = `${p.displayName} ${p.type} ${p.tagline ?? ""} ${p.actives.map((a) => a.label).join(" ")}`.toLowerCase();
        if (hay.includes(text)) score += 2;
      }
      return { p, score };
    })
    .filter((x) => ((q.concernKeys?.length || q.bodyArea || text) ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score || popularity(b.p) - popularity(a.p));

  // One result per product family (sizes/scents are listed under it).
  const seen = new Set<string>();
  const results = [];
  for (const { p } of scored) {
    if (seen.has(p.family)) continue;
    seen.add(p.family);
    const sizes = visibleProducts
      .filter((s) => s.family === p.family)
      .map((s) => ({ id: s.id, size: s.size, price: s.price }));
    results.push({ ...card(p), sizes, routineStep: p.routineStep ?? null });
    if (results.length >= (q.limit ?? 6)) break;
  }
  return { pricesAsOf, count: results.length, results };
}

export function productDetails(id: string) {
  const p = getProduct(id);
  if (!p || !p.available || p.duplicateOf) return { error: `No available product with id "${id}" exists in the catalogue.` };
  return {
    ...card(p),
    family: p.family,
    benefits: p.benefits ?? [],
    keyIngredients: p.keyIngredients ?? [],
    fullIngredients: p.fullIngredients ?? null,
    formulatedWithout: p.formulatedWithout ?? null,
    allConcerns: p.concerns.map((c) => `${c.label} (${c.strength})`),
    howToUse: p.howToUse ?? [],
    usageFrequency: p.usageFrequency ?? [],
    suitability: (p.suitability ?? []).slice(0, 8),
    precautions: (p.precautions ?? []).map((x) => x.text).slice(0, 6),
    exfoliant: p.actives.some((a) => a.exfoliant),
    contents: p.isKit
      ? p.contains?.length
        ? p.contains.map((c) => c.name)
        : "This kit's contents are not listed here: see the product page."
      : undefined,
  };
}

export function compare(ids: string[]) {
  const rows = ids.map((id) => productDetails(id));
  return { products: rows };
}

export function validate(ids: string[]) {
  const valid: Product[] = [];
  const invalid: string[] = [];
  for (const id of ids) {
    const p = getProduct(id);
    if (p && p.available && !p.duplicateOf) valid.push(p);
    else invalid.push(id);
  }
  return { valid, invalid };
}

/* ---------------- Routine ---------------- */

export type RoutineItem = ProductCard & { slots: Slot[]; step: string | null };
export type Routine = {
  items: RoutineItem[];
  am: string[];
  pm: string[];
  weekly: string[];
  supplement: string[];
  total: number;
  warnings: string[];
  pricesAsOf: string;
};

function defaultSlots(p: Product): Slot[] {
  if (p.isSupplement) return ["supplement"];
  if (p.type === "sunscreen") return ["am"];
  const freq = (p.usageFrequency ?? []).join(" ").toLowerCase();
  if (p.type === "scrub" || /week/.test(freq)) return ["weekly"];
  const { am, pm } = p.timeOfDay;
  if (am && pm) return ["am", "pm"];
  if (am) return ["am"];
  return ["pm"];
}

export function buildRoutine(entries: { id: string; slots?: Slot[] }[]): Routine & { rejected: string[] } {
  const { invalid } = validate(entries.map((e) => e.id));
  const items: RoutineItem[] = [];
  const families = new Set<string>();
  const rejected = [...invalid.map((id) => `${id}: not in catalogue`)];
  for (const e of entries) {
    const p = getProduct(e.id);
    if (!p || !p.available || p.duplicateOf) continue;
    if (families.has(p.family)) {
      rejected.push(`${p.id}: another size/scent of "${p.displayName}" is already in the routine`);
      continue;
    }
    families.add(p.family);
    let slots = e.slots?.length ? e.slots : defaultSlots(p);
    if (p.type === "sunscreen") slots = ["am"]; // sunscreen is always a morning step
    if (p.isSupplement) slots = ["supplement"];
    items.push({ ...cardFull(p), slots, step: p.routineStep ?? null });
  }
  return { ...finishRoutine(items), rejected };
}

function finishRoutine(items: RoutineItem[]): Routine {
  const bySlot = (s: Slot) => items.filter((i) => i.slots.includes(s)).map((i) => i.id);
  const warnings: string[] = [];
  for (const s of ["am", "pm", "weekly"] as Slot[]) {
    const ex = items.filter((i) => i.slots.includes(s) && getProduct(i.id)!.actives.some((a) => a.exfoliant));
    if (ex.length > 1)
      warnings.push(
        `Exfoliant layering: ${ex.map((i) => i.name).join(" + ")} are both exfoliating and share the ${s.toUpperCase()} slot. Use them on different days or start slowly, to avoid irritation.`
      );
  }
  const hasExfoliant = items.some((i) => getProduct(i.id)!.actives.some((a) => a.exfoliant));
  if (hasExfoliant && !items.some((i) => i.type === "sunscreen"))
    warnings.push("Exfoliating ingredients can make skin more sun-sensitive: a sunscreen in the morning is recommended.");
  if (items.some((i) => i.isSupplement))
    warnings.push("Supplements: please check with a doctor before starting, especially if pregnant, nursing or on medication.");
  warnings.push("Patch-test any new product on a small area for 24 hours before regular use.");
  return {
    items,
    am: bySlot("am"),
    pm: bySlot("pm"),
    weekly: bySlot("weekly"),
    supplement: bySlot("supplement"),
    total: items.reduce((sum, i) => sum + i.price, 0),
    warnings,
    pricesAsOf,
  };
}

export function updateRoutine(
  current: Routine | null,
  action: "remove" | "add" | "swap",
  productId: string,
  replacementId?: string,
  slots?: Slot[]
) {
  const entries: { id: string; slots?: Slot[] }[] = (current?.items ?? []).map((i) => ({ id: i.id, slots: i.slots }));
  let next = entries;
  if (action === "remove") next = entries.filter((e) => e.id !== productId);
  if (action === "add") next = [...entries, { id: productId, slots }];
  if (action === "swap") {
    next = entries.map((e) => (e.id === productId ? { id: replacementId ?? "", slots } : e));
    if (!entries.some((e) => e.id === productId)) return { error: `"${productId}" is not in the current routine.` };
  }
  return buildRoutine(next);
}

export { concernLabels };
