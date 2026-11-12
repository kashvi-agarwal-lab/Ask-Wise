// Product-side safety rules (server only: they need the catalogue). The AI cannot override these.
//
// IMPORTANT: these are CONSERVATIVE AUTOMATION RULES, not clinical facts. They decide what the app
// is willing to suggest automatically. A product being left out does NOT mean it is unsafe, and a
// product being allowed does NOT mean it is "safe in pregnancy" or "safe for children". When the
// app cannot be sure, it abstains and points the customer to a doctor (or to the brand).
// Policy summary (also shown in tests/policy.test.ts):
//   Pregnant / breastfeeding / trying to conceive -> only products with a full ingredient list,
//     no listed active from REVIEW_ACTIVES, no review-term in the ingredients, and no supplements.
//     Everything else is "not checked automatically: ask your doctor".
//   Under 18 -> only everyday basics: no acids, benzoyl peroxide, medicated anti-dandruff actives,
//     hair-growth actives, supplements or razors. Parent/guardian and doctor guidance is shown.
//   Known allergy -> products whose full ingredient list is missing are left out (compatibility
//     unknown), and products matching the allergen or any of its common aliases are left out.
//     If the allergen is unknown or unrecognised, the app recommends nothing and explains why.
//   Dry / sensitive skin -> no strong actives (see strengthOf).
import type { Product } from "./catalogue";

export type SafetyCtx = {
  pregnant?: boolean; // pregnant, breastfeeding or trying to conceive
  mildOnly?: boolean; // dry or sensitive skin: no strong actives
  minor?: boolean; // under 18
  allergens?: string[]; // canonical allergen names (keys of ALLERGENS)
  allergyUnknown?: boolean; // an allergy was mentioned but we cannot tell which ingredient
  excludeFamilies?: string[]; // products the customer reacted to
};

/** Listed actives the app will not suggest automatically during pregnancy or breastfeeding. */
const REVIEW_ACTIVES = new Set(["salicylic-acid", "benzoyl-peroxide", "glycolic-acid", "lactic-acid", "aha", "ketoconazole", "zpto", "redensyl"]);
/** Ingredient words that also need a doctor's review (scanned in names and ingredient lists). */
const REVIEW_TERMS =
  /retinol|retinoid|retinal\b|tretinoin|adapalene|hydroquinone|benzoyl peroxide|salicylic|salicylate|glycolic|lactic acid|mandelic|\baha\b|\bbha\b|ketoconazole|pyrithione|minoxidil|redensyl|procapil|capixyl|hair growth/;

const productText = (p: Product) =>
  [p.name, p.displayName, p.highlightIngredients ?? "", ...(p.keyIngredients ?? []), p.fullIngredients ?? ""].join(" ").toLowerCase();

/** Why the app will not suggest this product automatically during pregnancy/breastfeeding (null = not flagged). */
export function pregnancyReason(p: Product): string | null {
  if (p.isSupplement) return "it's a supplement, so it needs a doctor's go-ahead";
  const active = p.actives.find((a) => REVIEW_ACTIVES.has(a.key) || a.exfoliant);
  if (active) return `it contains ${active.label.toLowerCase()}, which Ask Wise doesn't suggest automatically during pregnancy or breastfeeding`;
  const term = productText(p).match(REVIEW_TERMS)?.[0];
  if (term) return `it contains ${term}, which Ask Wise doesn't suggest automatically during pregnancy or breastfeeding`;
  if (!p.fullIngredients) return "its full ingredient list isn't available to check";
  return null;
}
/** Kept for older callers: true = not suggested automatically during pregnancy/breastfeeding. */
export const isPregnancyUnsafe = (p: Product) => pregnancyReason(p) !== null;

/** Why the app will not suggest this product automatically for someone under 18 (null = fine). */
export function minorReason(p: Product): string | null {
  if (p.isSupplement) return "supplements for under-18s need a doctor";
  if (p.type === "tool" && /razor/i.test(p.name)) return "razors aren't suggested for under-18s";
  const active = p.actives.find((a) => REVIEW_ACTIVES.has(a.key) || a.exfoliant);
  if (active) return `it contains ${active.label.toLowerCase()}, and Ask Wise only suggests gentle basics for under-18s`;
  if (/hair growth|redensyl|ketoconazole|pyrithione|minoxidil/.test(productText(p))) return "it's a medicated or hair-growth product, which Ask Wise doesn't suggest for under-18s";
  return null;
}

/* ---------- Allergies ---------- */

/** Common allergens and the names they appear under in ingredient lists (INCI and everyday names). */
export const ALLERGENS: Record<string, RegExp> = {
  fragrance: /fragrance|parfum|perfume|\baroma\b|linalool|limonene|citronellol|geraniol|coumarin|eugenol|hexyl cinnamal/,
  "essential oils": /essential oil|lavender|lavandula|tea tree|melaleuca|eucalyptus|peppermint|mentha|rosemary|rosmarinus|citrus|lemon|orange peel|bergamot|clove|ylang/,
  "salicylic acid": /salicylic|salicylate|\bbha\b|willow bark|salix/,
  "benzoyl peroxide": /benzoyl peroxide/,
  "AHAs (glycolic, lactic, mandelic)": /glycolic|lactic acid|mandelic|\baha\b|alpha hydroxy|citric acid/,
  niacinamide: /niacinamide|nicotinamide|vitamin b3/,
  "vitamin C": /ascorbic|ascorbyl|vitamin c\b/,
  retinoids: /retin|adapalene/,
  urea: /\burea\b/,
  coconut: /coconut|cocos nucifera|cocamid|coco-?glucoside|cocoyl|coco-?betaine/,
  "nuts and nut oils": /almond|prunus amygdalus|argan|argania|macadamia|walnut|juglans|hazelnut|corylus|shea|butyrospermum|peanut|arachis|cashew/,
  shea: /shea|butyrospermum/,
  lanolin: /lanolin/,
  sulfates: /sulfate|sulphate|\bsls\b|\bsles\b|lauryl sulfate|laureth sulfate/,
  parabens: /paraben/,
  "anti-dandruff actives": /ketoconazole|pyrithione|zpto/,
  aloe: /aloe/,
  "drying alcohol": /alcohol denat|denatured alcohol|sd alcohol|\bethanol\b/,
  "silicones": /dimethicone|siloxane|silicone|cyclopenta/,
  "propylene glycol": /propylene glycol/,
  "chemical sunscreen filters": /avobenzone|oxybenzone|octocrylene|octinoxate|homosalate|ethylhexyl methoxycinnamate|bemotrizinol|bisoctrizole/,
  "zinc oxide": /zinc oxide/,
  "titanium dioxide": /titanium dioxide/,
  menthol: /menthol/,
  caffeine: /caffeine/,
  biotin: /biotin/,
  gelatin: /gelatin/,
  "kojic acid": /kojic/,
  "hyaluronic acid": /hyaluron/,
};

/** Recognised allergens named in the customer's words (canonical names). */
export function allergensFromText(text: string): string[] {
  const t = text.toLowerCase();
  const found = Object.entries(ALLERGENS)
    .filter(([name, re]) => re.test(t) || t.includes(name.toLowerCase()))
    .map(([name]) => name);
  // Everyday words the customer might use for a group
  if (/\bnuts?\b|tree nut/.test(t) && !found.includes("nuts and nut oils")) found.push("nuts and nut oils");
  if (/\bacids?\b/.test(t) && !found.some((f) => /AHA|salicylic/.test(f))) found.push("AHAs (glycolic, lactic, mandelic)", "salicylic acid");
  if (/\bscent|smell|perfumed/.test(t) && !found.includes("fragrance")) found.push("fragrance");
  return [...new Set(found)];
}

/** Why a product cannot be suggested for this customer's allergy (null = no match found in a complete list). */
export function allergyReason(p: Product, allergens: string[]): string | null {
  if (!allergens.length) return null;
  if (!p.fullIngredients) return "its full ingredient list isn't available, so it can't be checked against your allergy";
  const text = productText(p);
  for (const a of allergens) {
    const re = ALLERGENS[a];
    if (re && re.test(text)) return `it lists ${a.toLowerCase()} (or a related ingredient), which you said you react to`;
  }
  return null;
}

/* ---------- Strength ---------- */

const pct = (name: string): number => {
  const m = name.match(/(\d+(?:\.\d+)?)\s*%/);
  return m ? parseFloat(m[1]) : 0;
};

/** 0 = no strong active, 1 = a mild active, 2 = strong (2%+ salicylic, benzoyl peroxide, 5%+ acids, scrubs). */
export function strengthOf(p: Product): 0 | 1 | 2 {
  const keys = new Set(p.actives.map((a) => a.key));
  if (keys.has("benzoyl-peroxide")) return 2;
  if (p.type === "scrub") return 2;
  const n = pct(p.name);
  if (keys.has("salicylic-acid")) return n >= 2 ? 2 : 1;
  if (keys.has("glycolic-acid") || keys.has("lactic-acid") || keys.has("aha")) return n >= 5 ? 2 : 1;
  return 0;
}

export const isStrongActive = (p: Product) => strengthOf(p) === 2;

/** The first reason this product is excluded for this customer, or null if the app may suggest it. */
export function exclusionReason(p: Product, ctx?: SafetyCtx): string | null {
  if (!ctx) return null;
  if (ctx.allergyUnknown) return "you mentioned an allergy, and without knowing the ingredient I can't check products against it";
  if (ctx.excludeFamilies?.includes(p.family)) return "you said you reacted to this product";
  if (ctx.allergens?.length) {
    const r = allergyReason(p, ctx.allergens);
    if (r) return r;
  }
  if (ctx.pregnant) {
    const r = pregnancyReason(p);
    if (r) return r;
  }
  if (ctx.minor) {
    const r = minorReason(p);
    if (r) return r;
  }
  if (ctx.mildOnly && isStrongActive(p)) return "it's a strong active, and your skin is dry or sensitive";
  return null;
}

export function isAllowed(p: Product, ctx?: SafetyCtx): boolean {
  return exclusionReason(p, ctx) === null;
}
