// Priority 3, item 10: tan and pigmentation copy is grounded in the same catalogue evidence.
import { describe, it, expect } from "vitest";
import { flowHint } from "@/lib/flow";
import { card } from "@/lib/engine";
import { getProduct, visibleProducts } from "@/lib/catalogue";

describe("evidence-grounded copy", () => {
  it("the tan hint never tells the AI that products fade tan", () => {
    const hint = flowHint({ concerns: ["tan"] }, 0);
    expect(hint).toMatch(/Never say a product fades/);
    expect(hint).not.toMatch(/help (lighten|fade) it/);
  });
  it("cards separate 'made for' (primary) from secondary concern tags", () => {
    const c = card(getProduct("salicylic-acid-face-wash")!);
    expect(c.primaryKeys).toContain("face-acne");
    expect(c.primaryKeys).not.toContain("pigmentation");
    expect(c.concernKeys).toContain("pigmentation");
  });
  it("face pigmentation hint matches the catalogue", () => {
    const hasPrimary = visibleProducts.some((p) => p.category === "face" && p.concerns.some((x) => x.key === "pigmentation" && x.strength === "primary"));
    const hint = flowHint({ concerns: ["pigmentation"], bodyAreas: ["face"] }, 0);
    expect(/no strong match/.test(hint)).toBe(!hasPrimary);
  });
});
