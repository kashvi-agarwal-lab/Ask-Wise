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
