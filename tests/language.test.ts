// Priority 2, item 6: Hindi / Hinglish concerns.
import { describe, it, expect } from "vitest";
import { applyAnswers, needsOptions } from "@/lib/flow";
import { nextScripted, concernKeysFromText, writesHinglish } from "@/lib/script";
import { user } from "./helpers";

const MSG = "mere baal bahut jhad rahe hain aur scalp me khujli hai";

describe("Hinglish", () => {
  it("recognises hair fall and does not ask skin type", () => {
    expect(concernKeysFromText(MSG)).toContain("hair-fall");
    const msgs = [user(MSG)];
    const p = applyAnswers({}, msgs);
    const q = nextScripted(p, msgs, needsOptions(p));
    expect(q?.id).not.toBe("skin_type");
    expect(q?.id).not.toBe("skin_feel");
  });
  it("says honestly that questions are in English, in the customer's language", () => {
    const msgs = [user(MSG)];
    const p = applyAnswers({}, msgs);
    expect(nextScripted(p, msgs, needsOptions(p))?.question).toMatch(/Hinglish/);
    expect(writesHinglish(MSG)).toBe(true);
    expect(writesHinglish("I have acne on my back")).toBe(false);
  });
  it("other common Hinglish concerns", () => {
    expect(concernKeysFromText("chehre pe bahut daane hain")).toContain("face-acne");
    expect(concernKeysFromText("peeth pe muhase")).toContain("body-acne");
    expect(concernKeysFromText("baalon mein rusi hai")).toContain("dandruff");
  });
});
