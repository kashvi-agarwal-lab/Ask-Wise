// Priority 2, item 5: typed answers are checked against the question that was asked.
import { describe, it, expect } from "vitest";
import { applyAnswers, needsOptions } from "@/lib/flow";
import { nextScripted, normalizeAnswer } from "@/lib/script";
import { user, askedScripted } from "./helpers";

const run = (msgs: Parameters<typeof applyAnswers>[1]) => {
  const p = applyAnswers({}, msgs);
  return { p, q: nextScripted(p, msgs, needsOptions(p)) };
};

describe("answer validation", () => {
  it("'Female' for hair-fall location is not stored; the question is asked again kindly", () => {
    const { p, q } = run([user("I'm losing a lot of hair"), askedScripted("hair_pattern"), user("Female")]);
    expect(p.hairPattern).toBeUndefined();
    expect(q?.id).toBe("hair_pattern");
    expect(q?.question).toMatch(/didn't quite catch/);
  });
  it("'Sensitive' for duration is not stored as a duration", () => {
    const { p, q } = run([user("I have acne on my face"), askedScripted("skin_type"), user("Oily"), askedScripted("duration"), user("Sensitive")]);
    expect(p.duration).toBeUndefined();
    expect(p.skinType).toBe("oily"); // the earlier answer is untouched
    expect(q?.id).toBe("duration");
  });
  it("clear synonyms are mapped to the right option", () => {
    expect(normalizeAnswer("duration", "about 2 years")).toBe("More than 6 months");
    expect(normalizeAnswer("duration", "3 weeks")).toBe("Less than a month");
    expect(normalizeAnswer("hair_pattern", "mostly at the front")).toBe("Hairline or parting");
    expect(normalizeAnswer("skin_type", "pretty greasy")).toBe("Oily");
    expect(normalizeAnswer("skin_type", "idk")).toBe("Not sure");
    expect(normalizeAnswer("mode", "a full routine please")).toBe("Complete routine");
    expect(normalizeAnswer("needs", "wash and moisturiser", ["Cleansing", "Treatment", "Moisturising", "Sun protection"])).toBe("Cleansing, Moisturising");
  });
  it("a new concern mid-questionnaire is taken in, not rejected", () => {
    const { p, q } = run([user("I have acne on my face"), askedScripted("skin_type"), user("also my hair is falling out a lot")]);
    expect(p.concerns).toContain("hair-fall");
    expect(p.skinType).toBeUndefined();
    expect(q?.question ?? "").not.toMatch(/didn't quite catch/);
  });
  it("a safety disclosure mid-questionnaire is recorded", () => {
    const { p } = run([user("I have acne on my face"), askedScripted("skin_type"), user("I'm pregnant by the way")]);
    expect(p.skinType).toBeUndefined();
    expect(p.clarify?.interrupted).toBe(true);
  });
});
