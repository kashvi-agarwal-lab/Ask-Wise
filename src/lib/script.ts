// The questions the APP asks (not the AI), in a fixed, sensible order. Every option leads
// somewhere useful, "Not sure" never dead-ends (a different question follows), and a
// recommendation is only made after a couple of real answers unless the customer already
// gave rich detail up front.
import type { UIMessage } from "ai";
import type { Profile } from "./prompt";
import { CONCERN_LABELS } from "./concerns";
import { allergensFromText } from "./safety";
import { allUserText, ageBandFromText, mentionsAllergy, mentionsPregnancy } from "./safety-text";

export type Scripted = { id: string; question: string; options: string[]; multiSelect?: boolean };

/* ---------- Reading what the customer already said ---------- */

/** Attempts to read the app's instructions, keys or settings (always declined, never followed). */
export const asksForInternals = (text: string) =>
  /system prompt|your (instructions|prompt|rules|tools|config)|ignore (all |any |the |your )?(previous |prior |above )?(instructions|rules)|api[ _-]?key|secret|\.env\b|env(ironment)? var|password|developer mode|jailbreak|reveal (your|the) (prompt|instructions)/i.test(text);

const ON_TOPIC =
  /skin|hair|scalp|body|face|acne|pimple|spot|routine|product|bodywise|be bodywise|wash|serum|lotion|sunscreen|spf|\btan\b|dry|oily|itch|rash|dandruff|pregnan|breastfe|allerg|cream|moistur|underarm|odou?r|sweat|heel|stretch|price|cart|order|buy|shampoo|condition|frizz|pigment|dark|patch|glow|dull|wrinkle|ageing|aging|gumm|supplement|sleep|vitamin|baal|chehr|daane|khujli|rusi|twacha/i;
const QUESTION_LIKE =
  /\?|^(what|who|when|where|why|how|which|tell me|write|explain|translate|calculate|solve|give me|list|define)\b|capital of|weather|joke|news|cricket|movie|recipe|stock|bitcoin|\b(code|python|javascript|typescript|java|sql|html|css|regex|function|program|script|debug|compile|algorithm)\b/i;

/** The latest message is not about skin, hair or body care (trivia, code, homework...) or asks for internals. */
export function isOffTopic(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (asksForInternals(t)) return true;
  if (ON_TOPIC.test(t) || concernKeysFromText(t).length || writesHinglish(t)) return false;
  return QUESTION_LIKE.test(t);
}

/** "no dandruff", "not dandruff", "without flakes", "rusi nahi"... */
export function deniesDandruff(text: string): boolean {
  const t = text.toLowerCase();
  return /\b(no|not|without|never|don'?t have( any)?|isn'?t)\s+(any\s+)?(dandruff|flakes|flaking|rusi)\b|\b(dandruff|rusi)\s+(nahi|nahin|nhi)\b|no flakes, just itchy/.test(t);
}

/** An itchy scalp (in English or Hinglish). Itch alone is not treated as dandruff. */
export function scalpItchFromText(text: string): boolean {
  const t = text.toLowerCase();
  return /(itch|khujli|khujali|kharish)/.test(t) && /(scalp|head|hair|baal|sir|sar)/.test(t);
}

/** The customer writes in Hindi or Hinglish (Roman script or Devanagari). */
export function writesHinglish(text: string): boolean {
  if (/[\u0900-\u097F]/.test(text)) return true;
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  const hits = words.filter((w) => HINDI_WORDS.has(w)).length;
  return hits >= 2 && hits / Math.max(words.length, 1) >= 0.2;
}
const HINDI_WORDS = new Set("hai hain mere meri mera mujhe bahut rahe raha rahi nahi nahin kya aur ho ki ka ke se me mein baal chehre chehra daane khujli jhad gir kaise kyun karu karun bhi thoda zyada wala wali".split(" "));

export function concernKeysFromText(text: string): string[] {
  const t = text.toLowerCase();
  const keys = new Set<string>();
  for (const [k, label] of Object.entries(CONCERN_LABELS)) if (t.includes(label.toLowerCase())) keys.add(k);
  const rules: [RegExp, string][] = [
    [/(face|facial).{0,12}(acne|pimple|breakout)|(acne|pimples?|breakouts?).{0,15}(face|forehead|cheek|chin|nose)|forehead pimples/, "face-acne"],
    [/(back|body|chest|shoulder).{0,12}(acne|pimple|breakout)|(acne|pimples?|bacne).{0,15}(back|body|chest|shoulders)|\bbacne\b/, "body-acne"],
    [/hair ?(fall|loss)|losing (more |a lot of )?hair|hair (is )?(thinning|falling|shedding)|thinning hair|balding|receding|shedding (a lot of )?hair/, "hair-fall"],
    [/dandruff|flaky scalp|scalp flakes|white flakes/, "dandruff"], // (an itchy scalp alone is NOT dandruff: see scalpItchFromText)
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
  // Hindi / Hinglish (Roman script) ways of saying the same things
  const hinglish: [RegExp, string][] = [
    [/baal\b.{0,25}(jhad|jhar|gir|toot|tut|kam ho)|(jhad|jhar|gir) rahe|hair ?fall ho/, "hair-fall"],
    [/\b(rusi|roosi|ruusi)\b/, "dandruff"],
    [/(chehr[ae]|munh|face).{0,20}(daane|dane|muhase|muhanse|pimple)|(daane|dane|muhase|muhanse).{0,20}(chehr[ae]|munh)/, "face-acne"],
    [/(peeth|kamar|back).{0,20}(daane|dane|muhase|muhanse|pimple)|(daane|dane|muhase|muhanse).{0,20}(peeth|kamar)/, "body-acne"],
    [/(skin|twacha|tvacha|chamdi).{0,15}(rukhi|rookhi|sukhi|dry)|rukhi (skin|twacha|tvacha)/, "dry-skin"],
    [/\b(daag|dhabb?e|jhaaiyan|jhaiyan|jhaiyaan)\b/, "pigmentation"],
    [/\b(bagal|kankh)\b.{0,20}(kal[ae]|kaal[ae]|dark)/, "underarm-darkness"],
    [/pasin[ae].{0,15}(badbu|smell|bu\b)|\bbadbu\b/, "underarm-odour"],
    [/baal.{0,15}(rukhe|rookhe|dry|bejaan)/, "dry-hair"],
  ];
  for (const [re, k] of hinglish) if (re.test(t)) keys.add(k);
  if (/\b(daane|dane|muhase|muhanse)\b/.test(t) && !keys.has("face-acne") && !keys.has("body-acne")) keys.add("acne");
  if (deniesDandruff(t)) keys.delete("dandruff");
  if (/\bacne\b|\bpimples?\b|breakouts?/.test(t) && !keys.has("face-acne") && !keys.has("body-acne")) keys.add("acne"); // acne, area unknown
  return [...keys];
}

export function areasFromText(text: string, keys: string[]): string[] {
  const t = text.toLowerCase();
  const a = new Set<string>();
  if (keys.includes("face-acne") || /\b(face|facial|forehead|cheeks?|chin)\b/.test(t)) a.add("face");
  if (keys.includes("body-acne") || /\b(back|chest|shoulders?|body|legs?|arms?|underarms?|feet|heels?)\b/.test(t)) a.add("body");
  if (/\b(chehr[ae]|munh)\b/.test(t)) a.add("face");
  if (/\b(peeth|kamar)\b/.test(t)) a.add("body");
  if (keys.some((k) => ["hair-fall", "dandruff", "frizz-damage", "dry-hair"].includes(k)) || /\b(hair|scalp|baal|sir|sar)\b/.test(t)) a.add("scalp");
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
  flakes: {
    question: "Do you also see white flakes on your scalp or shoulders?",
    options: ["Yes, white flakes", "No flakes, just itchy", "Not sure"],
  },
  allergen: {
    question: "Which ingredient or product caused the reaction? Type it if it isn't listed.",
    options: ["Fragrance", "Salicylic acid", "Essential oils", "Not sure which one"],
  },
};

export const SAFETY_OPTIONS = {
  minor: "Under 18",
  pregnant: "Pregnant, breastfeeding or trying to conceive",
  allergy: "Skin or ingredient allergy",
  none: "None of these",
  skip: "Prefer not to say",
};

/** The safety check-in: one optional, multi-select question. Only asks about what we don't already know. */
export function safetyQuestion(profile: Profile, text: string): Scripted | null {
  const opts: string[] = [];
  if (!profile.ageBand && !ageBandFromText(text)) opts.push(SAFETY_OPTIONS.minor);
  if (!profile.pregnantOrNursing && !mentionsPregnancy(text)) opts.push(SAFETY_OPTIONS.pregnant);
  if (!profile.allergyStatus && !mentionsAllergy(text)) opts.push(SAFETY_OPTIONS.allergy);
  if (!opts.length) return null;
  return {
    id: "safety",
    question: "Before I suggest anything: do any of these apply to you? It's optional, and it only helps me keep suggestions safe.",
    options: [...opts, SAFETY_OPTIONS.none, SAFETY_OPTIONS.skip],
    multiSelect: true,
  };
}

const HAIR_KEYS = ["hair-fall", "dandruff", "frizz-damage", "dry-hair", "brows-lashes"];
const WELLNESS_KEYS = ["sleep", "muscle-soreness", "energy-immunity", "bone-health"];
const has = (p: Profile, k: string) => (p.concerns ?? []).includes(k);
const isHairProfile = (p: Profile) => (p.concerns ?? []).some((k) => HAIR_KEYS.includes(k)) || !!p.scalpItch;
const isWellness = (p: Profile) => (p.concerns ?? []).length > 0 && (p.concerns ?? []).every((k) => WELLNESS_KEYS.includes(k));
const isSkin = (p: Profile) => !isHairProfile(p) && !isWellness(p);
const informative = (p: Profile) => (p.answered ?? []).filter((id) => ["area", "hair_pattern", "skin_type", "skin_feel", "duration", "history"].includes(id)).length;

/** Which of the app's questions comes next (null = nothing more to ask, time to recommend). */
export function nextScripted(profile: Profile, messages: UIMessage[], needsOptions: string[]): Scripted | null {
  const q = nextScriptedRaw(profile, messages, needsOptions);
  if (q && !(profile.askedIds ?? []).length && writesHinglish(allUserText(messages)))
    return { ...q, question: `${q.question} (Sawaal simple English mein hain, tap karke jawab de sakte hain. Hindi ya Hinglish mein likhna bhi bilkul theek hai.)` };
  const c = profile.clarify;
  if (q && c && c.id === q.id)
    return {
      ...q,
      question: c.interrupted ? `Thanks for telling me. To keep going: ${lowerFirst(q.question)}` : `Sorry, I didn't quite catch that. ${q.question}`,
    };
  return q;
}
const lowerFirst = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

function nextScriptedRaw(profile: Profile, messages: UIMessage[], needsOptions: string[]): Scripted | null {
  // No concern yet (a greeting, a general question, something unrelated): the app's skin
  // questionnaire does not start. The AI asks what they need help with, or redirects.
  if (!(profile.concerns ?? []).length && !profile.scalpItch) return null;
  const unsure = new Set(profile.unsure ?? []);
  const asked = new Set(profile.askedIds ?? []);
  const q = (id: string): Scripted => ({ id, ...QUESTIONS[id] });
  const first = allUserText(messages.filter((m) => m.role === "user").slice(0, 1));
  const rich = richUpfront(first);

  const acneUnknown = has(profile, "acne") && !has(profile, "face-acne") && !has(profile, "body-acne");
  if (acneUnknown && !asked.has("area")) return q("area");
  if (has(profile, "hair-fall") && !profile.hairPattern && !asked.has("hair_pattern")) return q("hair_pattern");
  // An itchy scalp is not confirmed dandruff: ask about flakes instead of assuming.
  if (profile.scalpItch && !has(profile, "dandruff") && !profile.noDandruff && !asked.has("flakes")) return q("flakes");
  if (isSkin(profile) && !isWellness(profile) && !profile.skinType && !asked.has("skin_type")) return q("skin_type");
  if (isSkin(profile) && unsure.has("skin_type") && !profile.skinType && !asked.has("skin_feel")) return q("skin_feel");
  // "A recommendation must be earned": at least two real answers, unless the first message was rich.
  if (!rich && informative(profile) < 2 && (profile.concerns ?? []).length) {
    if (!profile.duration && !asked.has("duration")) return q("duration");
    if (!profile.history && !asked.has("history")) return q("history");
  }
  // Safety check-in (age band, pregnancy, allergy) before any personalised recommendation.
  if (!asked.has("safety") && (profile.concerns ?? []).length) {
    const s = safetyQuestion(profile, allUserText(messages));
    if (s) return s;
  }
  // An allergy was mentioned but we don't know what to: ask (once) before recommending anything.
  if (profile.allergyStatus === "yes" && !profile.allergens?.length && !profile.allergyText && !asked.has("allergen")) return q("allergen");
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

/* ---------- Checking a typed answer against the question that was asked ---------- */

const UNSURE = /\b(not sure|unsure|no idea|don'?t know|dont know|idk|pata nahi|nahi pata|maybe)\b/i;
const pick = (t: string, table: [RegExp, string][]) => table.find(([re]) => re.test(t))?.[1] ?? null;

/**
 * The canonical answer (one of the question's options) for what the customer typed or tapped,
 * or null when it does not answer THIS question (the app then asks again, kindly, instead of
 * storing something wrong).
 */
export function normalizeAnswer(id: string, reply: string, needsOptions: string[] = []): string | null {
  const t = reply.trim().toLowerCase();
  if (!t) return null;
  const opts = [...(QUESTIONS[id]?.options ?? []), ...needsOptions];
  const exact = opts.find((o) => o.toLowerCase() === t);
  if (exact) return exact;
  switch (id) {
    case "area": {
      const face = /\b(face|facial|forehead|cheeks?|chin|nose|jaw)\b/.test(t);
      const body = /\b(body|back|chest|shoulders?|arms?|legs?|butt|bum|neck)\b|bacne/.test(t);
      if (/\bboth\b/.test(t) || (face && body)) return "Both face and body";
      return body ? "Body (back, chest, shoulders)" : face ? "Face" : null;
    }
    case "hair_pattern":
      if (UNSURE.test(t)) return "Not sure";
      return pick(t, [
        [/hairline|parting|part line|front|temple|widow|forehead|crown|top of/, "Hairline or parting"],
        [/clump|comb|brush|wash|shower|pillow|bunch|handful|drain|strands? fall/, "Clumps when washing or combing"],
        [/all over|everywhere|overall|whole|entire|general|thin(ning)? (all|every)|diffuse/, "All over my head"],
      ]);
    case "skin_type":
      if (UNSURE.test(t)) return "Not sure";
      return pick(t, [
        [/sensitive|reactive|irritat|easily red/, "Sensitive"],
        [/combination|combo|mixed|t-?zone/, "Combination"],
        [/oily|greasy|shiny/, "Oily"],
        [/\bdry\b|flaky|tight/, "Dry"],
        [/\bnormal\b|balanced/, "Normal"],
      ]);
    case "skin_feel":
      if (UNSURE.test(t)) return "Not sure";
      return pick(t, [
        [/only on|t-?zone|forehead|nose/, "Oily only on forehead and nose"],
        [/tight|flaky|\bdry\b|stretch/, "Tight or flaky"],
        [/shiny|oily|greasy/, "Shiny or oily all over"],
        [/comfortable|fine|normal|neither|\bok(ay)?\b|balanced/, "Comfortable, neither"],
      ]);
    case "duration": {
      if (UNSURE.test(t)) return "Not sure";
      const m = t.match(/(\d+(?:\.\d+)?)\s*(day|week|month|year|saal|mahin)/);
      if (m) {
        const n = parseFloat(m[1]);
        const months = /day/.test(m[2]) ? n / 30 : /week/.test(m[2]) ? n / 4.3 : /year|saal/.test(m[2]) ? n * 12 : n;
        return months < 1 ? "Less than a month" : months <= 6 ? "1 to 6 months" : "More than 6 months";
      }
      return pick(t, [
        [/less than a month|few (days|weeks)|a week|couple of weeks|recent|just started|new\b/, "Less than a month"],
        [/more than 6|over (6|six)|years?|long time|ages|always|forever|since (i was|childhood|school|my teens)/, "More than 6 months"],
        [/1 ?(to|-) ?6|few months|couple of months|some months|months/, "1 to 6 months"],
      ]);
    }
    case "history":
      if (UNSURE.test(t)) return "Not sure";
      return pick(t, [
        [/strong|acid|retin|tretinoin|adapalene|benzoyl|salicylic|glycolic|\baha\b|\bbha\b|prescri/, "Yes, strong actives (acids, retinol, benzoyl peroxide)"],
        [/^(no|nope|never|none|nothing)\b|first time|haven'?t|not yet/, "No, this is my first time"],
        [/mild|everyday|basic|regular|face ?wash|moisturi|cream|lotion|soap/, "Yes, mild everyday products"],
      ]);
    case "flakes":
      if (UNSURE.test(t)) return "Not sure";
      if (deniesDandruff(t) || /^(no|nope|nahi|nahin)\b|just itch/.test(t)) return "No flakes, just itchy";
      if (/^(yes|yeah|haan|ha)\b|flake|dandruff|rusi|white/.test(t)) return "Yes, white flakes";
      return null;
    case "mode":
      return pick(t, [
        [/routine|full|complete|everything|whole|\bboth\b|am.?pm|morning/, "Complete routine"],
        [/individual|picks?\b|products?\b|just|single|one\b|few/, "Individual picks"],
      ]);
    case "needs": {
      if (/decide|you choose|everything|\ball\b|anything/.test(t)) return "You decide for me";
      const table: [RegExp, string][] = [
        [/treat|serum|acne|spot|roll-?on|growth/, "Treatment"],
        [/clean|wash|shampoo|soap/, "Cleansing"],
        [/condition/, "Conditioning"],
        [/moistur|lotion|cream|hydrat/, "Moisturising"],
        [/sun|spf/, "Sun protection"],
        [/underarm|deo|odou?r|roll/, "Underarm care"],
      ];
      const got = [...new Set(t.split(/,|\band\b|&|\+/).map((x) => pick(x.trim(), table)).filter((x): x is string => !!x))].filter(
        (x) => !needsOptions.length || needsOptions.includes(x)
      );
      return got.length ? got.join(", ") : null;
    }
    case "safety": {
      const hits =
        /under ?18|minor|teen|pregnan|breastfe|nursing|conceive|allerg|react|none|no\b|nope|nothing|n\/a|not applicable|prefer not|rather not|skip|private/.test(t) ||
        !!ageBandFromText(t) ||
        mentionsPregnancy(t);
      return hits ? reply.trim() : null;
    }
    case "allergen":
      return reply.trim(); // their own words: unrecognised = "unknown", which makes the app abstain
    default:
      return reply.trim();
  }
}

/** Applies one answer. Returns false (and stores nothing) when the reply does not answer this question. */
export function applyScriptedAnswer(next: Profile, id: string, reply: string, needsOptions: (p: Profile) => string[]): boolean {
  const canon = normalizeAnswer(id, reply, id === "needs" ? needsOptions(next) : []);
  if (canon === null) return false;
  const r = canon;
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
    case "safety": {
      // (pregnancy, age and allergy in these answers are also read from the text by applyAnswers)
      if (/prefer not/i.test(r)) {
        next.ageBand ??= "undisclosed";
        if (!next.pregnantOrNursing) next.pregnancyUndisclosed = true;
        next.allergyStatus ??= "undisclosed";
      } else {
        if (/under 18/i.test(r)) next.ageBand = "minor";
        if (/allergy/i.test(r)) next.allergyStatus = "yes";
        if (/none of these/i.test(r)) {
          next.ageBand ??= "adult";
          next.allergyStatus ??= "none";
        } else {
          next.ageBand ??= /under 18/i.test(r) ? "minor" : "adult";
          next.allergyStatus ??= /allergy/i.test(r) ? "yes" : "none";
        }
      }
      done();
      break;
    }
    case "flakes":
      if (/^yes/i.test(r)) next.concerns = [...new Set([...(next.concerns ?? []), "dandruff"])];
      else {
        next.noDandruff = true; // "no" or "not sure": never assume dandruff
        if (notSure) unsure();
      }
      if (!notSure) done();
      break;
    case "allergen":
      next.allergyText = r;
      if (!notSure && !/not sure/i.test(r)) next.allergens = [...new Set([...(next.allergens ?? []), ...allergensFromText(r)])];
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
  return true;
}
