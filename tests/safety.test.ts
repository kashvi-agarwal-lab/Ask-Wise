// Priority 1: safety context (age band, pregnancy/breastfeeding, allergy) and the product policy.
import { describe, it, expect } from "vitest";
import { applyAnswers, needsOptions } from "@/lib/flow";
import { nextScripted } from "@/lib/script";
import { ageBandFromText, mentionsAllergy, safetySignature, sigStricter } from "@/lib/safety-text";
import { exclusionReason, pregnancyReason, minorReason, allergensFromText, allergyReason, isAllowed } from "@/lib/safety";
import { products, getProduct } from "@/lib/catalogue";
import { searchProducts } from "@/lib/engine";
import { user, askedScripted } from "./helpers";

const nextFor = (msgs: Parameters<typeof applyAnswers>[1]) => {
  const p = applyAnswers({}, msgs);
  return { p, q: nextScripted(p, msgs, needsOptions(p)) };
};
const visible = products.filter((p) => p.available && !p.duplicateOf);

describe("age band", () => {
  it("reads a stated age without collecting more than a band", () => {
    expect(ageBandFromText("I'm 12 and I have acne")).toBe("minor");
    expect(ageBandFromText("I am 15 years old")).toBe("minor");
    expect(ageBandFromText("main 16 saal ki hoon")).toBe("minor");
    expect(ageBandFromText("I'm 25")).toBe("adult");
    expect(ageBandFromText("I've had acne for 15 years")).toBeUndefined();
    expect(ageBandFromText("using a 2% face wash")).toBeUndefined();
  });
  it("a 12-year-old with acne does not get acids or benzoyl peroxide", () => {
    const { p } = nextFor([user("I'm 12 and I have acne on my face")]);
    expect(p.ageBand).toBe("minor");
    const ctx = { minor: true };
    const allowed = searchProducts({ concernKeys: ["face-acne"], category: "face", limit: 10 }, ctx).results.map((r) => getProduct(r.id)!);
    for (const prod of allowed) expect(prod.actives.some((a) => ["salicylic-acid", "benzoyl-peroxide", "glycolic-acid"].includes(a.key))).toBe(false);
  });
  it("minors never get supplements, razors or hair-growth products", () => {
    for (const p of visible.filter((x) => x.isSupplement || /razor|hair growth/i.test(x.name))) expect(minorReason(p)).not.toBeNull();
  });
});

describe("safety check-in question", () => {
  it("is asked before the mode question, as one optional multi-select", () => {
    const msgs = [user("I have acne on my face"), askedScripted("skin_type"), user("Oily"), askedScripted("duration"), user("1 to 6 months")];
    const { q } = nextFor(msgs);
    expect(q?.id).toBe("safety");
    expect(q?.multiSelect).toBe(true);
    expect(q?.options).toContain("Prefer not to say");
  });
  it("does not offer what the customer already said", () => {
    const { q } = nextFor([user("I'm pregnant and I have acne on my face, oily skin, for 2 months"), askedScripted("skin_type"), user("Oily")]);
    expect(q?.id).toBe("safety");
    expect(q?.options.some((o) => /pregnant/i.test(o))).toBe(false);
  });
  it("'Skin or ingredient allergy' leads to the 'which ingredient' question, never straight to products", () => {
    const msgs = [user("dry skin on my body"), askedScripted("skin_type"), user("Dry"), askedScripted("duration"), user("More than 6 months"), askedScripted("safety"), user("Skin or ingredient allergy")];
    expect(nextFor(msgs).q?.id).toBe("allergen");
  });
  it("'Prefer not to say' moves on without guessing", () => {
    const msgs = [user("dry skin on my body"), askedScripted("skin_type"), user("Dry"), askedScripted("duration"), user("More than 6 months"), askedScripted("safety"), user("Prefer not to say")];
    const { p, q } = nextFor(msgs);
    expect(q?.id).toBe("mode");
    expect(p.ageBand).toBe("undisclosed");
    expect(p.pregnantOrNursing).toBeFalsy();
  });
});

describe("pregnancy policy (conservative automation, not clinical facts)", () => {
  it("abstains on actives, supplements and products without a full ingredient list", () => {
    for (const p of visible) {
      const r = pregnancyReason(p);
      if (p.isSupplement || p.actives.some((a) => a.exfoliant || a.key === "benzoyl-peroxide") || !p.fullIngredients) expect(r).not.toBeNull();
    }
  });
  it("reasons never claim a product is unsafe or banned", () => {
    for (const p of visible) {
      const r = pregnancyReason(p) ?? "";
      expect(r).not.toMatch(/unsafe|banned|dangerous|safe in pregnancy/i);
    }
  });
});

describe("allergies", () => {
  it("recognises allergens and their aliases", () => {
    expect(allergensFromText("I'm allergic to perfume")).toContain("fragrance");
    expect(allergensFromText("tea tree oil")).toContain("essential oils");
    expect(allergensFromText("coconut")).toContain("coconut");
  });
  it("matches INCI aliases in full ingredient lists and treats missing lists as unknown", () => {
    const withParfum = visible.find((p) => /parfum|fragrance/i.test(p.fullIngredients ?? ""));
    if (withParfum) expect(allergyReason(withParfum, ["fragrance"])).toMatch(/fragrance/);
    const noList = visible.find((p) => !p.fullIngredients)!;
    expect(allergyReason(noList, ["fragrance"])).toMatch(/isn't available/);
  });
  it("an unknown allergen means no automated product suggestions at all", () => {
    for (const p of visible) expect(isAllowed(p, { allergyUnknown: true })).toBe(false);
  });
  it("detects disclosure but not 'no allergies'", () => {
    expect(mentionsAllergy("I have an allergy to a product")).toBe(true);
    expect(mentionsAllergy("No allergies, not pregnant")).toBe(false);
  });
});

describe("re-checking after a later disclosure", () => {
  it("pregnancy mentioned after results makes the earlier signature stale", () => {
    const then = safetySignature("I have acne on my back");
    const now = safetySignature("I have acne on my back. Actually I'm pregnant");
    expect(sigStricter(then, now)).toBe(true);
    expect(sigStricter(now, now)).toBe(false);
  });
  it("earlier acne picks get a reason once pregnancy is known", () => {
    const wash = getProduct("2-5-benzoyl-peroxide-bodywash")!;
    expect(exclusionReason(wash, {})).toBeNull();
    expect(exclusionReason(wash, { pregnant: true })).toMatch(/benzoyl/i);
  });
});
