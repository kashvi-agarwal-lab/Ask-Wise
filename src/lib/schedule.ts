// How often each product should really be used. Built from the product's own usage guidance
// (catalogue / official Be Bodywise page), with general safe-use limits for strong actives.
// AM/PM is NOT a fixed template: steps can be daily, a few times a week, or weekly.
import { roleOf, type Product } from "./catalogue";
import { strengthOf } from "./safety";

export type Slot = "am" | "pm" | "daily" | "alt" | "weekly" | "supplement";

export type Schedule = { slots: Slot[]; when: string };

const SERUM_AFTER_WASH = /(after|post)[^.]{0,40}(shampoo|conditioner|washing)|towel[- ]?dr|damp hair|wet hair|wash(ed)? hair/i;

export function scheduleFor(p: Product): Schedule {
  const role = roleOf(p);
  const freq = (p.usageFrequency ?? []).join(" ").toLowerCase();
  const how = (p.howToUse ?? []).join(" ");
  const twice = /twice|2 times a day|morning and (evening|night)/.test(freq + " " + how.toLowerCase());
  const weekly = /week/.test(freq);
  const strong = strengthOf(p) === 2;
  const mildActive = strengthOf(p) === 1;
  const { am, pm } = p.timeOfDay;

  if (role === "supplement") return { slots: ["supplement"], when: "Daily, as per the pack. Check with a doctor first" };
  if (role === "sunscreen") return { slots: ["am"], when: "Every morning as the last step. Reapply every 2–3 hours if you're out in the sun" };
  if (role === "conditioner") return { slots: ["alt"], when: "After shampoo, on wash days (2–3 times a week)" };
  if (role === "exfoliator") return { slots: ["weekly"], when: "1–2 times a week, never on the same day as other exfoliating acids" };

  if (role === "cleanser") {
    if (p.type === "shampoo") return { slots: ["alt"], when: "2–3 times a week on wash days. Never more than once a day" };
    if (p.type === "body wash")
      return {
        slots: ["daily"],
        when: strong ? "Once a day in your shower. If skin feels dry or tight, use it every other day" : "Once a day in your shower (not morning and evening)",
      };
    // face wash
    if (strong) return { slots: ["pm"], when: "Once a day, in the evening. Cut back to a few times a week if skin feels dry. Don't use it more than once a day" };
    if (mildActive) return { slots: ["pm"], when: "Once a day. Use it in the evening, and don't overuse it" };
    return twice ? { slots: ["am", "pm"], when: "Morning and evening" } : { slots: ["am", "pm"], when: "Morning and evening" };
  }

  if (role === "moisturiser") {
    if (p.type === "lotion") {
      if (strong) return { slots: ["alt"], when: "Every other day to start, then daily if your skin is comfortable" };
      return { slots: ["daily"], when: "Once a day, after your shower, on damp skin" };
    }
    if (am && pm) return { slots: ["am", "pm"], when: "Morning and evening" };
    return { slots: ["am", "pm"], when: "Morning and evening" };
  }

  if (role === "deodorant") {
    // the product's own page says how often
    if (twice) return { slots: ["am", "pm"], when: "As the product page says: up to twice a day, on clean dry underarms" };
    return { slots: ["pm"], when: "Once a day on clean, dry underarms" };
  }

  // treatments (serums, roll-ons, patches, sticks, creams)
  if (p.category === "hair") {
    if (SERUM_AFTER_WASH.test(how)) return { slots: ["alt"], when: "On wash days, after shampoo and conditioner (towel-dry first)" };
    if (twice) return { slots: ["am", "pm"], when: "Twice a day (morning and evening), consistently for about 3 months, as the product page says" };
    if (/alternate/.test(freq)) return { slots: ["alt"], when: "Every other day" };
    return { slots: ["pm"], when: "Once a day, in the evening" };
  }
  if (/as required|as needed/.test(freq) || p.type === "patch") return { slots: ["pm"], when: "On active spots, as needed (usually overnight)" };
  if (weekly) return { slots: ["weekly"], when: "1–2 times a week" };
  if (strong) return { slots: ["alt"], when: "Every other day to start, then daily if your skin is comfortable. Don't overuse it" };
  if (/alternate/.test(freq)) return { slots: ["alt"], when: "Every other day" };
  if (pm && !am) return { slots: ["pm"], when: "Once a day, in the evening" };
  if (am && !pm) return { slots: ["am"], when: "Once a day, in the morning" };
  return twice ? { slots: ["am", "pm"], when: "Morning and evening" } : { slots: ["pm"], when: "Once a day, in the evening" };
}

/** Does this product only work properly after other steps (shampoo, conditioner)? */
export function needsWashFirst(p: Product): { shampoo: boolean; conditioner: boolean } {
  const how = (p.howToUse ?? []).join(" ");
  if (p.category !== "hair") return { shampoo: false, conditioner: false };
  return {
    shampoo: SERUM_AFTER_WASH.test(how) || roleOf(p) === "conditioner",
    conditioner: /conditioner/i.test(how),
  };
}
