// The "app code" role: filters the catalogue, validates product IDs and does the maths.
// The AI never invents products or prices; it can only use what these functions return.
import { isAllowed, strengthOf, type SafetyCtx } from "./safety";
import { scheduleFor, needsWashFirst, type Slot } from "./schedule";
import { visibleProducts, getProduct, concernLabels, pricesAsOf, roleOf, variantsOf, type Product, type Role, type Variant } from "./catalogue";

export type { Role, Variant };
export type { Slot };

// The scent is the customer's choice, so it is never part of the product name shown on a card.
const stripScent = (name: string) =>
  name.replace(/\s*[–-]\s*(flora|watermelon|aqua|oudh|fragrance[ -]?free|no fragrance)\s*$/i, "").replace(/\s*\((flora|watermelon|aqua|oudh)[^)]*\)\s*/i, " ").trim();

/** Ingredients to SHOW: the official card text from the Be Bodywise page, not the app's own ingredient-scan tags. */
export function displayIngredients(p: Product): string[] {
  const hi = (p.highlightIngredients ?? "").split(/,|&| and /).map((x) => x.trim()).filter(Boolean);
  if (hi.length) return hi;
  if (p.keyIngredients?.length) return p.keyIngredients.flatMap((k) => k.split(/,/).map((x) => x.trim())).filter(Boolean);
  return p.actives.map((a) => a.label);
}

// What each ingredient is known for, in plain words. Kept soft ("known for"), never a medical claim.
const INGREDIENT_NOTES: [RegExp, string][] = [
  [/salicylic|\bsa\b|\bbha\b/i, "known for unclogging pores"],
  [/glycolic/i, "known for gently exfoliating dead skin"],
  [/lactic/i, "known for gently exfoliating and hydrating"],
  [/\baha\b/i, "known for exfoliating dead skin cells"],
  [/benzoyl/i, "known for targeting acne-causing bacteria"],
  [/niacinamide/i, "known for supporting the skin barrier and an even-looking tone"],
  [/urea/i, "known for hydrating and softening rough, dry skin"],
  [/ceramide/i, "known for supporting the skin barrier"],
  [/peptide/i, "known for supporting the skin barrier"],
  [/kojic/i, "known for brightening the look of dark patches"],
  [/redensyl|procapil|baicapil|aminexil|anagain|hair growth actives/i, "a hair-growth active used in thinning-hair formulas"],
  [/rosemary/i, "a botanical traditionally used in hair care"],
  [/biotin/i, "a vitamin often used to support hair"],
  [/ketoconazole|zpto|zinc pyrithione/i, "an anti-dandruff ingredient"],
  [/argan/i, "known for conditioning hair"],
  [/shea|cocoa/i, "known for moisturising"],
  [/magnesium/i, "a mineral often used in body-care for muscle comfort"],
  [/zinc oxide|titanium|mineral/i, "a mineral sun filter"],
];

/** Plain-words notes for the first two key ingredients of a product. */
export function ingredientNotes(names: string[]): { name: string; note: string }[] {
  const out: { name: string; note: string }[] = [];
  for (const n of names) {
    const hit = INGREDIENT_NOTES.find(([re]) => re.test(n));
    if (hit && !out.some((o) => o.note === hit[1])) out.push({ name: n.replace(/^[\d.]+%\s*/, "").replace(/^SA$/i, "Salicylic acid"), note: hit[1] });
    if (out.length === 2) break;
  }
  return out;
}

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
    actives: displayIngredients(p),
    role: roleOf(p),
    variants: variantsOf(p),
    chosen: false, // becomes true once the customer picks a size or scent themselves
  };
}
/** Card plus the facts shown in the expandable sections (ingredients, how to use, precautions). */
export function cardFull(p: Product) {
  return {
    ...card(p),
    ingredientNotes: ingredientNotes(displayIngredients(p)),
    keyIngredients: (p.keyIngredients ?? []).slice(0, 4),
    howToUse: (p.howToUse ?? []).slice(0, 5),
    precautions: (p.precautions ?? []).map((x) => x.text).slice(0, 3),
  };
}
export type ProductCard = ReturnType<typeof cardFull>;

export const popularity = (p: Product) => (p.rating ?? 3) * Math.log10((p.reviewCount ?? 0) + 10);

/** How well a product fits the customer's concerns: primary match 3, secondary 1. */
export function fitScore(p: Product, concernKeys: string[]): number {
  return concernKeys.reduce((s, k) => {
    const c = p.concerns.find((x) => x.key === k);
    return s + (c ? (c.strength === "primary" ? 3 : 1) : 0);
  }, 0);
}

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

export type RoutineItem = ProductCard & { slots: Slot[]; when: string; companion?: boolean; step: string | null };
export type Routine = {
  items: RoutineItem[];
  am: string[];
  pm: string[];
  daily: string[];
  alt: string[]; // 2–3 times a week
  weekly: string[];
  supplement: string[];
  notes: string[]; // plain explanations, e.g. why a companion product was added
  total: number;
  savings: number; // total discount versus MRP
  startSlow: string[];
  warnings: string[];
  pricesAsOf: string;
};

/** Closest shampoo or conditioner in the range for the routine's hair concern. */
function pickCompanion(kind: "shampoo" | "conditioner", concernKeys: string[], taken: Set<string>, ctx?: SafetyCtx): Product | undefined {
  return visibleProducts
    .filter((p) => p.category === "hair" && !p.isKit && !p.isSupplement && (kind === "shampoo" ? p.type === "shampoo" : roleOf(p) === "conditioner"))
    .filter((p) => !taken.has(p.family) && isAllowed(p, ctx))
    .sort((a, b) => fitScore(b, concernKeys) - fitScore(a, concernKeys) || popularity(b) - popularity(a))[0];
}

export function buildRoutine(
  entries: { id: string; slots?: Slot[] }[],
  ctx?: SafetyCtx,
  opts?: { companions?: boolean }
): Routine & { rejected: string[] } {
  const { invalid } = validate(entries.map((e) => e.id));
  const items: RoutineItem[] = [];
  const families = new Set<string>();
  const notes: string[] = [];
  const rejected = [...invalid.map((id) => `${id}: not in catalogue`)];
  const add = (p: Product, companion = false, before?: number) => {
    families.add(p.family);
    const sch = scheduleFor(p); // how often, from the product's own usage guidance
    const item: RoutineItem = { ...cardFull(p), slots: sch.slots, when: sch.when, step: p.routineStep ?? null, ...(companion ? { companion: true } : {}) };
    if (before !== undefined && before >= 0) items.splice(before, 0, item);
    else items.push(item);
  };
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
    add(p);
  }

  // Companions: a hair serum used "after shampoo and conditioner" needs those steps to be followable.
  if (opts?.companions && items.length) {
    const prods = items.map((i) => getProduct(i.id)!);
    const needs = prods.map(needsWashFirst);
    const wantsShampoo = needs.some((n) => n.shampoo);
    const wantsConditioner = needs.some((n) => n.conditioner);
    const hasShampoo = prods.some((p) => p.type === "shampoo");
    const hasConditioner = prods.some((p) => roleOf(p) === "conditioner");
    const concernKeys = prods.flatMap((p) => p.concerns.filter((c) => c.strength === "primary").map((c) => c.key));
    const firstHair = items.findIndex((i) => i.category === "hair");
    const added: string[] = [];
    if (wantsShampoo && !hasShampoo) {
      const s = pickCompanion("shampoo", concernKeys, families, ctx);
      if (s) {
        add(s, true, firstHair);
        added.push("shampoo");
        if (/dandruff|ketoconazole|zpto/i.test(s.name + " " + s.type + " " + s.displayName))
          notes.push("The Bodywise shampoos are anti-dandruff formulas, so this is the closest shampoo in the range. Use it gently, only 2–3 times a week.");
      }
    }
    if ((wantsConditioner || wantsShampoo) && !hasConditioner) {
      const c = pickCompanion("conditioner", concernKeys, families, ctx);
      if (c) {
        add(c, true, firstHair >= 0 ? firstHair + (added.length ? 1 : 0) : -1);
        added.push("conditioner");
      }
    }
    if (added.length)
      notes.push(`Added a ${added.join(" and ")} so your hair products can be used the way their instructions say (they're applied after washing).`);
  }
  return { ...finishRoutine(items, notes), rejected };
}

const isStrong = (p: Product) =>
  p.actives.some((a) => a.exfoliant || a.key === "benzoyl-peroxide") || roleOf(p) === "exfoliator";

const SLOT_NAME: Record<string, string> = { am: "morning", pm: "evening", daily: "daily", alt: "few-times-a-week", weekly: "weekly", supplement: "supplement" };

function finishRoutine(items: RoutineItem[], notes: string[] = []): Routine {
  const bySlot = (s: Slot) => items.filter((i) => i.slots.includes(s)).map((i) => i.id);
  const prods = items.map((i) => ({ item: i, p: getProduct(i.id)! })).filter((x) => x.p.category !== "hair"); // skin and body only: hair products carry ingredient-scan tags that are not strong actives
  const warnings: string[] = [];

  // Clash check 1: more than one exfoliating product in the same slot
  for (const s of ["am", "pm", "daily", "alt", "weekly"] as Slot[]) {
    const ex = prods.filter(({ item, p }) => item.slots.includes(s) && p.actives.some((a) => a.exfoliant));
    if (ex.length > 1)
      warnings.push(
        `Exfoliant layering: ${ex.map((x) => x.item.name).join(" + ")} are all exfoliating and share the ${SLOT_NAME[s]} step. Use them on different days or start slowly, to avoid irritation.`
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
  for (const x of prods.filter(({ p }) => strengthOf(p) === 2 && !p.isSupplement))
    warnings.push(`Overuse warning: ${x.item.name} contains a strong active. Use it only as scheduled (${x.item.when.split(". ")[0].toLowerCase()}): more often can dry, sting or irritate.`);
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
    daily: bySlot("daily"),
    alt: bySlot("alt"),
    weekly: bySlot("weekly"),
    supplement: bySlot("supplement"),
    notes,
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
