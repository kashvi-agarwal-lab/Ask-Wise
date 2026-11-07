// The "app code" role: filters the catalogue, validates product IDs and does the maths.
// The AI never invents products or prices; it can only use what these functions return.
import { isAllowed, type SafetyCtx } from "./safety";
import { visibleProducts, getProduct, concernLabels, pricesAsOf, roleOf, variantsOf, type Product, type Role, type Variant } from "./catalogue";

export type { Role, Variant };
export type Slot = "am" | "pm" | "weekly" | "supplement";

// The scent is the customer's choice, so it is never part of the product name shown on a card.
const stripScent = (name: string) =>
  name.replace(/\s*[–-]\s*(flora|watermelon|aqua|oudh|fragrance[ -]?free|no fragrance)\s*$/i, "").replace(/\s*\((flora|watermelon|aqua|oudh)[^)]*\)\s*/i, " ").trim();

/** Short card data: everything the UI needs to draw a product card, taken from the catalogue. */
export function card(p: Product) {
  return {
    id: p.id,
    name: stripScent(p.displayName),
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
    concernKeys: p.concerns.map((c) => c.key),
    actives: p.actives.map((a) => a.label),
    role: roleOf(p),
    variants: variantsOf(p),
    chosen: false, // becomes true once the customer picks a size or scent themselves
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
  role?: Role;
  bodyArea?: string;
  maxPrice?: number;
  text?: string;
  includeKits?: boolean;
  includeSupplements?: boolean;
  excludeIds?: string[];
  limit?: number;
};

export function searchProducts(q: SearchInput, ctx?: SafetyCtx) {
  const text = q.text?.toLowerCase().trim();
  const scored = visibleProducts
    .filter((p) => !(p.isKit && !q.includeKits))
    .filter((p) => !(p.isSupplement && !q.includeSupplements && q.category !== "wellness"))
    .filter((p) => !q.category || p.category === q.category)
    .filter((p) => !q.type || p.type === q.type)
    .filter((p) => !q.role || roleOf(p) === q.role)
    .filter((p) => !q.maxPrice || p.price <= q.maxPrice)
    .filter((p) => !q.excludeIds?.includes(p.id))
    .filter((p) => isAllowed(p, ctx))
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
    // (variants, image and urls are left out here to keep the AI's input small)
    const { variants: _v, image: _i, url: _u, chosen: _c, concernKeys: _k, mrp: _m, ...light } = card(p);
    void [_v, _i, _u, _c, _k, _m];
    results.push({ ...light, sizes });
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
  savings: number; // total discount versus MRP
  startSlow: string[];
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
  if (pm) return ["pm"];
  if (roleOf(p) === "deodorant" && /twice/.test(freq)) return ["am", "pm"]; // the product page says to use it twice a day
  return ["pm"];
}

export function buildRoutine(entries: { id: string; slots?: Slot[] }[], ctx?: SafetyCtx): Routine & { rejected: string[] } {
  const { invalid } = validate(entries.map((e) => e.id));
  const items: RoutineItem[] = [];
  const families = new Set<string>();
  const rejected = [...invalid.map((id) => `${id}: not in catalogue`)];
  for (const e of entries) {
    const p = getProduct(e.id);
    if (!p || !p.available || p.duplicateOf) continue;
    if (!isAllowed(p, ctx)) {
      rejected.push(`${p.id}: not suitable for this customer (pregnancy or skin-type safety rule)`);
      continue;
    }
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

const isStrong = (p: Product) =>
  p.actives.some((a) => a.exfoliant || a.key === "benzoyl-peroxide") || roleOf(p) === "exfoliator";

function finishRoutine(items: RoutineItem[]): Routine {
  const bySlot = (s: Slot) => items.filter((i) => i.slots.includes(s)).map((i) => i.id);
  const prods = items.map((i) => ({ item: i, p: getProduct(i.id)! }));
  const warnings: string[] = [];

  // Clash check 1: more than one exfoliating product in the same slot
  for (const s of ["am", "pm", "weekly"] as Slot[]) {
    const ex = prods.filter(({ item, p }) => item.slots.includes(s) && p.actives.some((a) => a.exfoliant));
    if (ex.length > 1)
      warnings.push(
        `Exfoliant layering: ${ex.map((x) => x.item.name).join(" + ")} are all exfoliating and share the ${s.toUpperCase()} slot. Use them on different days or start slowly, to avoid irritation.`
      );
  }
  // Clash check 2: benzoyl peroxide together with acids
  const bpo = prods.filter(({ p }) => p.actives.some((a) => a.key === "benzoyl-peroxide"));
  const acids = prods.filter(({ p }) => p.actives.some((a) => a.exfoliant && a.key !== "benzoyl-peroxide"));
  if (bpo.length && acids.length)
    warnings.push(
      `Benzoyl peroxide (${bpo[0].item.name}) can be drying and irritating when used on the same days as exfoliating acids (${acids.map((x) => x.item.name).join(", ")}). Alternate them on different days.`
    );
  // Clash check 3: a physical scrub plus acids
  const scrubs = prods.filter(({ p }) => roleOf(p) === "exfoliator");
  if (scrubs.length && acids.length)
    warnings.push(`Scrub plus acids: ${scrubs[0].item.name} is a physical exfoliant. On scrub days, skip the exfoliating acids to avoid over-exfoliating.`);

  const hasExfoliant = prods.some(({ p }) => p.actives.some((a) => a.exfoliant));
  if (hasExfoliant && !items.some((i) => i.role === "sunscreen"))
    warnings.push("Exfoliating ingredients can make skin more sun-sensitive: a sunscreen in the morning is recommended.");
  if (items.some((i) => i.isSupplement))
    warnings.push("Supplements: please check with a doctor before starting, especially if pregnant, nursing or on medication.");
  warnings.push("Patch-test any new product on a small area for 24 hours before regular use.");

  // Start-slow plan: gentle basics first, then one strong active at a time
  const strong = prods.filter(({ p }) => isStrong(p) && !p.isSupplement);
  const basics = prods.filter(({ p }) => !isStrong(p) && !p.isSupplement);
  const startSlow: string[] = [];
  if (strong.length) {
    if (basics.length) startSlow.push(`Week 1: start with the gentle steps only (${basics.map((x) => x.item.name).join(", ")}).`);
    strong.forEach((x, k) => {
      const week = basics.length ? 2 + k * 2 : 1 + k * 2;
      startSlow.push(`Week ${week}: add ${x.item.name}, using it every other day at first, then daily if your skin is comfortable.`);
    });
    startSlow.push("If your skin stings, turns red or feels tight, pause the newest product and see a dermatologist if it continues.");
  }

  return {
    items,
    am: bySlot("am"),
    pm: bySlot("pm"),
    weekly: bySlot("weekly"),
    supplement: bySlot("supplement"),
    total: items.reduce((sum, i) => sum + i.price, 0),
    savings: items.reduce((sum, i) => sum + (i.mrp ? i.mrp - i.price : 0), 0),
    startSlow,
    warnings,
    pricesAsOf,
  };
}

export function updateRoutine(
  current: Routine | null,
  action: "remove" | "add" | "swap",
  productId: string,
  replacementId?: string,
  slots?: Slot[],
  ctx?: SafetyCtx
) {
  const entries: { id: string; slots?: Slot[] }[] = (current?.items ?? []).map((i) => ({ id: i.id, slots: i.slots }));
  let next = entries;
  if (action === "remove") next = entries.filter((e) => e.id !== productId);
  if (action === "add") next = [...entries, { id: productId, slots }];
  if (action === "swap") {
    next = entries.map((e) => (e.id === productId ? { id: replacementId ?? "", slots } : e));
    if (!entries.some((e) => e.id === productId)) return { error: `"${productId}" is not in the current routine.` };
  }
  return buildRoutine(next, ctx);
}

export { concernLabels };
