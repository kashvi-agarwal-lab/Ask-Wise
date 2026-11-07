import data from "../../data/products.json";

export type Concern = {
  key: string;
  label: string;
  strength: "primary" | "secondary";
};

export type Product = {
  id: string;
  name: string;
  displayName: string;
  family: string;
  size: string | null;
  category: "body" | "hair" | "face" | "sun-protection" | "wellness";
  type: string;
  isKit: boolean;
  isSupplement: boolean;
  url: string;
  image: string;
  price: number;
  mrp: number | null;
  available: boolean;
  duplicateOf?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  tagline?: string | null;
  benefits?: string[];
  keyIngredients?: string[];
  highlightIngredients?: string | null;
  fullIngredients?: string | null;
  formulatedWithout?: string | null;
  actives: { key: string; label: string; exfoliant: boolean }[];
  concerns: Concern[];
  bodyAreas: { key: string }[];
  howToUse?: string[];
  usageFrequency?: string[];
  routineStep?: string | null;
  timeOfDay: { am: unknown | null; pm: unknown | null };
  suitability?: string[];
  precautions?: { text: string; source: string }[];
  contains?: { name?: string; productIds?: string[] }[];
};

export const products = data.products as unknown as Product[];
export const concernLabels = data.concernLabels as Record<string, string>;
export const pricesAsOf = data.pricesAsOf as string;

/** Products a customer can actually buy and see (no hidden duplicates, in stock). */
export const visibleProducts = products.filter((p) => p.available && !p.duplicateOf);

export function getProduct(id: string) {
  return products.find((p) => p.id === id);
}

export function categoryStats(category: Product["category"]) {
  const list = visibleProducts.filter((p) => p.category === category && !p.isKit);
  return {
    count: new Set(list.map((p) => p.family)).size,
    from: Math.min(...list.map((p) => p.price)),
  };
}

/* ---------- Roles: what job a product does (decided by the app, not the AI) ---------- */
// The catalogue's own "routineStep" is unreliable (it files underarm roll-ons under "Cleanse"),
// so the app works out each product's role from its type and name.
export type Role =
  | "cleanser"
  | "treatment"
  | "moisturiser"
  | "sunscreen"
  | "deodorant"
  | "exfoliator"
  | "conditioner"
  | "supplement"
  | "kit"
  | "tool";

export function roleOf(p: Pick<Product, "type" | "name" | "isKit" | "isSupplement">): Role {
  if (p.isKit || p.type === "kit") return "kit";
  if (p.isSupplement || p.type === "gummies") return "supplement";
  if (p.type === "tool") return "tool";
  if (/underarm/i.test(p.name) && p.type !== "kit") return "deodorant";
  if (["body wash", "face wash", "shampoo"].includes(p.type)) return "cleanser";
  if (p.type === "scrub") return "exfoliator";
  if (p.type === "conditioner") return "conditioner";
  if (p.type === "sunscreen") return "sunscreen";
  if (p.type === "lotion" || p.type === "moisturiser") return "moisturiser";
  return "treatment"; // serums, hair/foot/stretch-mark roll-ons, patches, creams, exfoliating stick
}

/* ---------- Variants: sizes and scents of the same product ---------- */

export type Variant = {
  id: string;
  size: string | null;
  scent: string | null; // null when the product has no scent options
  price: number;
  mrp: number | null;
  url: string;
  image: string;
};

const SCENTS: [RegExp, string][] = [
  [/flora/i, "Flora"],
  [/watermelon/i, "Watermelon"],
  [/aqua/i, "Aqua"],
  [/oudh/i, "Oudh"],
  [/fragrance[ -]?free|no fragrance/i, "Fragrance-free"],
];

function sizeOf(p: Product): string | null {
  for (const src of [p.size, p.name]) {
    const m = src?.match(/(\d+(?:\.\d+)?)\s?(ml|gm|g|n)\b/i);
    if (m) {
      const u = m[2].toLowerCase();
      return `${m[1]} ${u === "ml" ? "mL" : u === "gm" ? "g" : u}`;
    }
  }
  return null;
}

function scentOf(p: Product): string | null {
  for (const [re, label] of SCENTS) if (re.test(p.name)) return label;
  return null;
}

/** All purchasable variants of a product (same family and type), cheapest/smallest first. */
export function variantsOf(p: Product): Variant[] {
  const sibs = visibleProducts.filter(
    (s) => s.family === p.family && s.type === p.type && !s.isKit === !p.isKit && !/-deal$/.test(s.id)
  );
  if (!sibs.some((s) => s.id === p.id)) sibs.push(p);
  const anyScent = sibs.some((s) => scentOf(s));
  const list = sibs.map((s) => ({
    id: s.id,
    size: sizeOf(s),
    scent: scentOf(s) ?? (anyScent ? "Original" : null),
    price: s.price,
    mrp: s.mrp && s.mrp > s.price ? s.mrp : null,
    url: s.url,
    image: s.image,
  }));
  return list.sort((a, b) => a.price - b.price || (a.scent ?? "").localeCompare(b.scent ?? ""));
}

/** "₹6.6/mL" style value for a size, or null if it cannot be worked out. */
export function unitPrice(price: number, size: string | null): { value: number; unit: string } | null {
  const m = size?.match(/^(\d+(?:\.\d+)?)\s?(mL|g)$/);
  return m ? { value: price / parseFloat(m[1]), unit: m[2] } : null;
}

/* ---------- Home page data (all real numbers from the catalogue) ---------- */

const popularity = (p: Product) => (p.rating ?? 0) * Math.log10((p.reviewCount ?? 0) + 10);

const oneVisiblePerFamily = (list: Product[]) => {
  const seen = new Set<string>();
  return list
    .filter((p) => {
      const key = p.family + (p.isKit ? ":kit" : "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

/** Best-reviewed everyday products (one per product family, cheapest size shown). */
export function topRated(n = 6): Product[] {
  const list = visibleProducts
    .filter((p) => !p.isKit && !p.isSupplement && p.type !== "tool" && (p.reviewCount ?? 0) >= 50)
    .sort((a, b) => popularity(b) - popularity(a) || a.price - b.price);
  return oneVisiblePerFamily(list).slice(0, n);
}

/** Kits and bundles worth showing: well reviewed, or at least sold. */
export function topKits(n = 4): Product[] {
  const list = visibleProducts.filter((p) => p.isKit && p.price > 0).sort((a, b) => popularity(b) - popularity(a) || a.price - b.price);
  return oneVisiblePerFamily(list).slice(0, n);
}

/** Real review totals across the range (each product family counted once). */
export function reviewStats() {
  const byFamily = new Map<string, Product>();
  for (const p of visibleProducts) if ((p.reviewCount ?? 0) > 0 && !byFamily.has(p.family)) byFamily.set(p.family, p);
  const list = [...byFamily.values()];
  const reviews = list.reduce((s, p) => s + (p.reviewCount ?? 0), 0);
  const avg = reviews ? list.reduce((s, p) => s + (p.rating ?? 0) * (p.reviewCount ?? 0), 0) / reviews : 0;
  return { reviews, avg: Math.round(avg * 10) / 10, products: new Set(visibleProducts.filter((p) => !p.isKit).map((p) => p.family)).size };
}
