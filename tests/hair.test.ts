// Priority 2, item 9: itchy scalp is not dandruff; no medicated products just to fill a routine.
import { describe, it, expect } from "vitest";
import { applyAnswers, needsOptions } from "@/lib/flow";
import { nextScripted, concernKeysFromText } from "@/lib/script";
import { buildRoutine, searchProducts } from "@/lib/engine";
import { getProduct } from "@/lib/catalogue";
import { isMedicated } from "@/lib/safety";
import { user, askedScripted } from "./helpers";

describe("itchy scalp and dandruff", () => {
  it("'no dandruff' is respected", () => {
    expect(concernKeysFromText("my hair is dry and my scalp is itchy but there is no dandruff")).not.toContain("dandruff");
  });
  it("itch without a dandruff answer leads to a flakes question, not a dandruff assumption", () => {
    const msgs = [user("my hair is dry and my scalp is itchy")];
    const p = applyAnswers({}, msgs);
    expect(p.concerns).not.toContain("dandruff");
    expect(nextScripted(p, msgs, needsOptions(p))?.id).toBe("flakes");
  });
  it("'Yes, white flakes' confirms dandruff; 'No flakes' blocks medicated shampoo", () => {
    const yes = applyAnswers({}, [user("itchy scalp"), askedScripted("flakes"), user("Yes, white flakes")]);
    expect(yes.concerns).toContain("dandruff");
    const no = applyAnswers({}, [user("itchy scalp"), askedScripted("flakes"), user("No flakes, just itchy")]);
    expect(no.noDandruff).toBe(true);
    const shampoos = searchProducts({ role: "cleanser", category: "hair", limit: 10 }, { avoidMedicated: true }).results;
    expect(shampoos.every((r) => !isMedicated(getProduct(r.id)!))).toBe(true);
  });
  it("a hair serum routine does not auto-insert a medicated shampoo (unless dandruff is the concern)", () => {
    const r = buildRoutine([{ id: "hair-strengthening-serum-50-ml" }], {}, { companions: true, concerns: ["dry-hair"] });
    expect(r.items.filter((i) => isMedicated(getProduct(i.id)!))).toEqual([]);
    expect(r.notes.join(" ")).toMatch(/usual gentle shampoo/);
    const d = buildRoutine([{ id: "hair-strengthening-serum-50-ml" }], {}, { companions: true, concerns: ["dandruff"] });
    expect(d.items.some((i) => isMedicated(getProduct(i.id)!))).toBe(true);
  });
  it("brow/lash serum is never a face-acne match (regression lead)", () => {
    const t = searchProducts({ role: "treatment", concernKeys: ["face-acne"], category: "face", limit: 10 }).results.map((r) => r.id);
    expect(t).not.toContain("brow-lash-serum");
  });
});
