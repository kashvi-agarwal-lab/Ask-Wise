// Product-side safety rules (server only: they need the catalogue). The AI cannot override these.
import type { Product } from "./catalogue";

export type SafetyCtx = {
  pregnant?: boolean; // pregnant or nursing: no retinol, salicylic acid, benzoyl peroxide, hydroquinone or chemical exfoliants
  mildOnly?: boolean; // dry or sensitive skin: no strong actives
};

const BAD_KEYS = new Set(["salicylic-acid", "benzoyl-peroxide", "glycolic-acid", "lactic-acid", "aha"]);

/** True if the product contains something that should not be used while pregnant or nursing without a doctor's say-so. */
export function isPregnancyUnsafe(p: Product): boolean {
  if (p.actives.some((a) => a.exfoliant || BAD_KEYS.has(a.key))) return true;
  const text = [p.name, p.highlightIngredients ?? "", ...(p.keyIngredients ?? []), p.fullIngredients ?? ""].join(" ").toLowerCase();
  return /retinol|retinoid|tretinoin|adapalene|hydroquinone|benzoyl peroxide|salicylic|glycolic|lactic acid|mandelic|\baha\b|\bbha\b/.test(text);
}

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

export function isAllowed(p: Product, ctx?: SafetyCtx): boolean {
  if (ctx?.pregnant && isPregnancyUnsafe(p)) return false;
  if (ctx?.mildOnly && isStrongActive(p)) return false;
  return true;
}
