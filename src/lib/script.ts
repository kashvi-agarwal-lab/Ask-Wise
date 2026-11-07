// The questions the APP asks (not the AI), in a fixed, sensible order. Every option leads
// somewhere useful, "Not sure" never dead-ends (a different question follows), and a
// recommendation is only made after a couple of real answers unless the customer already
// gave rich detail up front.
import type { UIMessage } from "ai";
import type { Profile } from "./prompt";
import { CONCERN_LABELS } from "./concerns";
import { allUserText } from "./safety-text";

export type Scripted = { id: string; question: string; options: string[]; multiSelect?: boolean };

/* ---------- Reading what the customer already said ---------- */

export function concernKeysFromText(text: string): string[] {
  const t = text.toLowerCase();
  const keys = new Set<string>();
  for (const [k, label] of Object.entries(CONCERN_LABELS)) if (t.includes(label.toLowerCase())) keys.add(k);
  const rules: [RegExp, string][] = [
    [/(face|facial).{0,12}(acne|pimple|breakout)|(acne|pimples?|breakouts?).{0,15}(face|forehead|cheek|chin|nose)|forehead pimples/, "face-acne"],
    [/(back|body|chest|shoulder).{0,12}(acne|pimple|breakout)|(acne|pimples?|bacne).{0,15}(back|body|chest|shoulders)|\bbacne\b/, "body-acne"],
    [/hair ?(fall|loss)|losing (more |a lot of )?hair|hair (is )?thinning|thinning hair|balding|receding/, "hair-fall"],
    [/dandruff|itchy scalp|flaky scalp/, "dandruff"],
    [/dry (and )?(flaky |rough )?skin|skin (feels |is )?dry/, "dry-skin"],
    [/\btan\b|tanning|suntan/, "tan"],
    [/pigmentation|dark (patches|spots)|dark marks/, "pigmentation"],
    [/dark underarm|underarm(s)? (is |are )?dark/, "underarm-darkness"],
    [/underarm odou?r|body odou?r|sweat/, "underarm-odour"],
    [/strawberry skin|keratosis|rough bumps/, "strawberry-skin"],
    [/stretch marks?/, "stretch-marks"],
    [/cracked heels?/, "cracked-heels"],
    [/frizz|damaged hair/, "frizz-damage"],
    [/dry (and )?(frizzy )?hair|hair (is |feels )?dry/, "dry-hair"],
    [/sun ?screen|sun protection|spf/, "sun-protection"],
  ];
  for (const [re, k] of rules) if (re.test(t)) keys.add(k);
  if (/\bacne\b|\bpimples?\b|breakouts?/.test(t) && !keys.has("face-acne") && !keys.has("body-acne")) keys.add("acne"); // acne, area unknown
  return [...keys];
}

export function areasFromText(text: string, keys: string[]): string[] {
  const t = text.toLowerCase();
  const a = new Set<string>();
  if (keys.includes("face-acne") || /\b(face|facial|forehead|cheeks?|chin)\b/.test(t)) a.add("face");
  if (keys.includes("body-acne") || /\b(back|chest|shoulders?|body|legs?|arms?|underarms?|feet|heels?)\b/.test(t)) a.add("body");
  if (keys.some((k) => ["hair-fall", "dandruff", "frizz-damage", "dry-hair"].includes(k)) || /\b(hair|scalp)\b/.test(t)) a.add("scalp");
  return [...a];
}

export function skinTypeFromText(text: string): string | undefined {
  const t = text.toLowerCase();
  if (/\bcombination skin\b|\boily (t-zone|in the t)/.test(t)) return "combination";
  if (/\bsensitive skin\b|\bskin (is|feels) sensitive|sensitive and/.test(t)) return "sensitive";
  if (/\boily skin\b|\bskin (is|feels) (very )?oily|\boily and\b/.test(t)) return "oily";
  if (/\bdry skin\b|\bdry and\b|\bskin (is|feels) (very )?dry/.test(t)) return "dry";
  if (/\bnormal skin\b/.test(t)) return "normal";
  return undefined;
}

export function modeFromText(text: string): "individual" | "routine" | undefined {
  const t = text.toLowerCase();
  if (/(complete|full|whole|entire)\s+routine|build me a routine|routine for|a routine\b/.test(t)) return "routine";
  if (/individual (picks|products)|just (a|one) (product|wash|cream)|a few products|suggest (a |some )?products?/.test(t)) return "individual";
  return undefined;
}

const durationFromText = (t: string) => /\bfor (the last |about |almost |over )?(\d+|a few|several|two|three|six) (days|weeks|months|years)\b|since (last|childhood|my teens)/i.test(t);

/** "Rich detail up front": the first message already says several useful things. */
export function richUpfront(firstText: string): boolean {
  const keys = concernKeysFromText(firstText);
  const facts = [
    keys.length > 0,
    areasFromText(firstText, keys).length > 0,
    !!skinTypeFromText(firstText),
    !!modeFromText(firstText),
    durationFromText(firstText),
  ].filter(Boolean).length;
  return facts >= 3;
}

/* ---------- The questions ---------- */

export const QUESTIONS: Record<string, Omit<Scripted, "id">> = {
  area: { question: "Where is the acne mostly showing up?", options: ["Face", "Body (back, chest, shoulders)", "Both face and body"] },
  hair_pattern: {
    question: "Where do you notice the hair fall most?",
    options: ["Hairline or parting", "All over my head", "Clumps when washing or combing", "Not sure"],
  },
  skin_type: { question: "How would you describe your skin type?", options: ["Oily", "Dry", "Combination", "Sensitive", "Not sure"] },
  skin_feel: {
    question: "A few hours after washing, how does your skin usually feel?",
    options: ["Tight or flaky", "Shiny or oily all over", "Oily only on forehead and nose", "Comfortable, neither", "Not sure"],
  },
  duration: { question: "How long have you been dealing with this?", options: ["Less than a month", "1 to 6 months", "More than 6 months", "Not sure"] },
  history: {
    question: "Have you tried any products for this before?",
    options: ["No, this is my first time", "Yes, mild everyday products", "Yes, strong actives (acids, retinol, benzoyl peroxide)", "Not sure"],
  },
  mode: { question: "Would you like individual product picks, or a complete routine?", options: ["Individual picks", "Complete routine"] },
};

const HAIR_KEYS = ["hair-fall", "dandruff", "frizz-damage", "dry-hair", "brows-lashes"];
const WELLNESS_KEYS = ["sleep", "muscle-soreness", "energy-immunity", "bone-health"];
const has = (p: Profile, k: string) => (p.concerns ?? []).includes(k);
const isHairProfile = (p: Profile) => (p.concerns ?? []).some((k) => HAIR_KEYS.includes(k));
const isWellness = (p: Profile) => (p.concerns ?? []).length > 0 && (p.concerns ?? []).every((k) => WELLNESS_KEYS.includes(k));
const isSkin = (p: Profile) => !isHairProfile(p) && !isWellness(p);
const informative = (p: Profile) => (p.answered ?? []).filter((id) => ["area", "hair_pattern", "skin_type", "skin_feel", "duration", "history"].includes(id)).length;

/** Which of the app's questions comes next (null = nothing more to ask, time to recommend). */
export function nextScripted(profile: Profile, messages: UIMessage[], needsOptions: string[]): Scripted | null {
  const unsure = new Set(profile.unsure ?? []);
  const asked = new Set(profile.askedIds ?? []);
  const q = (id: string): Scripted => ({ id, ...QUESTIONS[id] });
  const first = allUserText(messages.filter((m) => m.role === "user").slice(0, 1));
  const rich = richUpfront(first);

  const acneUnknown = has(profile, "acne") && !has(profile, "face-acne") && !has(profile, "body-acne");
  if (acneUnknown && !asked.has("area")) return q("area");
  if (has(profile, "hair-fall") && !profile.hairPattern && !asked.has("hair_pattern")) return q("hair_pattern");
  if (isSkin(profile) && !isWellness(profile) && !profile.skinType && !asked.has("skin_type")) return q("skin_type");
  if (isSkin(profile) && unsure.has("skin_type") && !profile.skinType && !asked.has("skin_feel")) return q("skin_feel");
  // "A recommendation must be earned": at least two real answers, unless the first message was rich.
  if (!rich && informative(profile) < 2 && (profile.concerns ?? []).length) {
    if (!profile.duration && !asked.has("duration")) return q("duration");
    if (!profile.history && !asked.has("history")) return q("history");
  }
  if (!profile.mode && !profile.decideForMe && !asked.has("mode")) return q("mode");
  if (profile.mode === "individual" && !profile.needs?.length && !profile.decideForMe && !asked.has("needs") && !isWellness(profile))
    return { id: "needs", question: "Which kinds of products would you like me to look at?", options: [...needsOptions, "You decide for me"], multiSelect: true };
  return null;
}

/** The customer was unsure about most things: recommend a gentle, low-risk starter and say so. */
export function starterMode(profile: Profile, messages: UIMessage[]): boolean {
  const first = allUserText(messages.filter((m) => m.role === "user").slice(0, 1));
  return !richUpfront(first) && informative(profile) < 2 && (profile.askedIds ?? []).length >= 2;
}

/* ---------- Reading answers ---------- */

export function applyScriptedAnswer(next: Profile, id: string, reply: string, needsOptions: (p: Profile) => string[]): void {
  const r = reply.trim();
  const notSure = /not sure/i.test(r);
  next.askedIds = [...new Set([...(next.askedIds ?? []), id])];
  const done = () => {
    next.answered = [...new Set([...(next.answered ?? []), id])];
  };
  const unsure = () => {
    next.unsure = [...new Set([...(next.unsure ?? []), id])];
  };
  switch (id) {
    case "area": {
      const add = /both/i.test(r) ? ["face", "body"] : /body/i.test(r) ? ["body"] : ["face"];
      next.bodyAreas = [...new Set([...(next.bodyAreas ?? []), ...add])];
      const keys = add.map((a) => (a === "face" ? "face-acne" : "body-acne"));
      next.concerns = [...new Set([...(next.concerns ?? []).filter((k) => k !== "acne"), ...keys])];
      done();
      break;
    }
    case "hair_pattern":
      if (notSure) unsure();
      else {
        next.hairPattern = r;
        done();
      }
      break;
    case "skin_type":
      if (notSure) unsure();
      else {
        next.skinType = r.toLowerCase();
        done();
      }
      break;
    case "skin_feel": {
      if (notSure) {
        unsure();
        break;
      }
      next.skinType = /tight|flaky/i.test(r) ? "dry" : /only on/i.test(r) ? "combination" : /shiny|oily/i.test(r) ? "oily" : "normal";
      done();
      break;
    }
    case "duration":
      if (notSure) unsure();
      else {
        next.duration = r;
        done();
      }
      break;
    case "history":
      if (notSure) unsure();
      else {
        next.history = r;
        done();
      }
      break;
    case "mode":
      if (/routine/i.test(r)) next.mode = "routine";
      else if (/individual|pick/i.test(r)) next.mode = "individual";
      done();
      break;
    case "needs":
      if (/decide/i.test(r)) {
        next.decideForMe = true;
        next.needs = needsOptions(next);
      } else next.needs = r.split(",").map((s) => s.trim()).filter(Boolean);
      done();
      break;
  }
}
