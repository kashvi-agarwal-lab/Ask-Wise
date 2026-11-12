// The app (not the AI) decides how far along the questions are, because the small free
// AI model skips rules in long prompts. This text is added to the AI's instructions.
import type { UIMessage } from "ai";
import type { Profile } from "./prompt";
import type { Role } from "./catalogue";
import { applyScriptedAnswer, areasFromText, concernKeysFromText, modeFromText, skinTypeFromText, starterMode } from "./script";
import { allUserText, ageBandFromText, mentionsAllergy, mentionsPregnancy, needsDoctor } from "./safety-text";
import { allergensFromText } from "./safety";

export const MAX_QUESTIONS = 9; // a ceiling (includes the safety check-in); the usual depth is 3 to 4 questions

const RESULT_TOOLS = ["tool-recommend_products", "tool-build_routine", "tool-update_routine"];

const HAIR = ["hair-fall", "dandruff", "frizz-damage", "dry-hair", "brows-lashes"];
const concernText = (profile: Profile) => (profile.concerns ?? []).join(" ").toLowerCase();
const isHair = (profile: Profile) => HAIR.some((k) => concernText(profile).includes(k)) || /hair|scalp|dandruff/.test(concernText(profile));
const isUnderarm = (profile: Profile) => /underarm|odour|odor|sweat/.test(concernText(profile));

/** The fixed "which kinds" choices, decided by the app from the customer's concern. */
export function needsOptions(profile: Profile): string[] {
  if (isHair(profile)) return ["Treatment", "Cleansing", "Conditioning"];
  if (isUnderarm(profile)) return ["Underarm care", "Cleansing", "Moisturising"];
  return ["Cleansing", "Treatment", "Moisturising", "Sun protection"];
}

const KIND: Record<string, Role> = {
  cleansing: "cleanser",
  treatment: "treatment",
  moisturising: "moisturiser",
  "sun protection": "sunscreen",
  conditioning: "conditioner",
  "underarm care": "deodorant",
};

const WELLNESS = ["sleep", "muscle-soreness", "energy-immunity", "bone-health"];
const isWellnessOnly = (profile: Profile) => {
  const c = concernText(profile).replace(/muscle-soreness|energy-immunity|bone-health|sleep/g, "");
  return WELLNESS.some((k) => concernText(profile).includes(k)) && !/acne|skin|hair|body|face|dry|tan|pigment/.test(c);
};

/** Order of recommendation groups: purpose-built treatments lead, supporting basics follow. */
export const KIND_PRIORITY: Record<string, number> = { treatment: 0, deodorant: 1, exfoliator: 2, cleanser: 3, moisturiser: 4, conditioner: 5, sunscreen: 6, supplement: 7 };

export type Group = { kind: Role; area: "face" | "body" | "scalp" | null; label: string };

const KIND_LABEL: Record<string, string> = {
  cleanser: "cleanser",
  treatment: "treatment",
  moisturiser: "moisturiser",
  sunscreen: "sunscreen",
  deodorant: "underarm care",
  conditioner: "conditioner",
};

export function groupLabel(kind: string, area: string | null | undefined, hair = false) {
  if (kind === "cleanser" && (hair || area === "scalp")) return "Shampoo";
  const base = KIND_LABEL[kind] ?? kind;
  const text = area && area !== "scalp" && kind !== "deodorant" ? `${area} ${base}` : base;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Every group of recommendations the customer asked for: each chosen kind x each area. */
export function requiredGroups(profile: Profile): Group[] {
  const hair = isHair(profile);
  const areas: ("face" | "body")[] = hair
    ? []
    : (["face", "body"] as const).filter((a) => (profile.bodyAreas ?? []).some((x) => x.toLowerCase().includes(a)));
  const groups: Group[] = [];
  for (const need of profile.needs ?? []) {
    const kind = KIND[need.toLowerCase()];
    if (!kind) continue;
    const perArea = areas.length > 1 && ["cleanser", "treatment", "moisturiser"].includes(kind);
    if (hair) groups.push({ kind, area: "scalp", label: groupLabel(kind, "scalp", true) });
    else if (perArea) areas.forEach((a) => groups.push({ kind, area: a, label: groupLabel(kind, a) }));
    else groups.push({ kind, area: areas.length === 1 ? areas[0] : null, label: groupLabel(kind, areas.length === 1 ? areas[0] : null) });
  }
  return groups.sort((a, b) => (KIND_PRIORITY[a.kind] ?? 9) - (KIND_PRIORITY[b.kind] ?? 9)).slice(0, 8);
}

const QUESTION_TOOLS = ["tool-ask_question", "tool-ask_needs", "tool-ask_scripted"];

/** How many questions were asked since the last results were shown (and whether "which kinds" was one). */
export function questionState(messages: UIMessage[]) {
  let asked = 0;
  let askedNeeds = false;
  for (const m of messages)
    for (const part of m.parts as { type: string }[]) {
      if (QUESTION_TOOLS.includes(part.type)) asked++;
      if (part.type === "tool-ask_needs") askedNeeds = true;
      if (RESULT_TOOLS.includes(part.type)) {
        asked = 0;
        askedNeeds = false;
      }
    }
  return { asked, askedNeeds };
}

const textOf = (m?: UIMessage) =>
  (m?.parts as { type: string; text?: string }[] | undefined)?.filter((p) => p.type === "text").map((p) => p.text).join(" ").trim() ?? "";

/**
 * Rebuild what we know about the customer from what they typed and from their answers to the
 * app's questions, so the profile never depends on the AI remembering to save anything.
 */
export function applyAnswers(profile: Profile, messages: UIMessage[]): Profile {
  // "You decide for me" counts only when the customer really said it, so ignore the AI's own value.
  const next: Profile = { ...profile, decideForMe: undefined, answered: [], unsure: [], askedIds: [], clarify: undefined };

  // 1. Things the customer already said, in their own words
  const typed = allUserText(messages);
  const keys = concernKeysFromText(typed);
  next.concerns = [...new Set([...(next.concerns ?? []).filter((k) => k !== "acne" || !keys.includes("face-acne") && !keys.includes("body-acne")), ...keys])];
  if (next.concerns.some((k) => k === "face-acne" || k === "body-acne")) next.concerns = next.concerns.filter((k) => k !== "acne");
  const areas = areasFromText(typed, next.concerns);
  if (areas.length) next.bodyAreas = [...new Set([...(next.bodyAreas ?? []), ...areas])];
  if (!next.skinType) next.skinType = skinTypeFromText(typed);
  if (!next.mode) next.mode = modeFromText(typed);
  // Safety facts the customer typed (age band, allergy) — read by the app, never left to the AI.
  const band = ageBandFromText(typed);
  if (band === "minor" || (band && !next.ageBand)) next.ageBand = band;
  if (mentionsAllergy(typed)) {
    next.allergyStatus = "yes";
    const said = typed.split(/[.!?\n]+/).filter((s) => /allerg|react|broke out|rash (from|after)/i.test(s)).join(". ");
    const found = allergensFromText(said);
    if (found.length) next.allergens = [...new Set([...(next.allergens ?? []), ...found])];
  }

  // 2. Their answers to the questions the app asked
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role !== "user" || messages[i - 1].role !== "assistant") continue;
    const reply = textOf(messages[i]);
    if (!reply) continue;
    const parts = messages[i - 1].parts as { type: string; output?: { question?: string; id?: string } }[];
    const scripted = parts.find((p) => p.type === "tool-ask_scripted");
    if (scripted?.output?.id) {
      const ok = applyScriptedAnswer(next, scripted.output.id, reply, needsOptions);
      // A reply that doesn't answer the question is never stored. If it is the latest message,
      // the app asks again: kindly, or (when they told us something new) after acknowledging it.
      if (!ok && i === messages.length - 1) {
        const interrupted =
          concernKeysFromText(reply).length > 0 || mentionsPregnancy(reply) || mentionsAllergy(reply) || !!ageBandFromText(reply) || needsDoctor(reply);
        next.clarify = { id: scripted.output.id, interrupted };
      }
      continue;
    }
    if (parts.some((p) => p.type === "tool-ask_needs")) {
      if (/decide/i.test(reply)) {
        next.decideForMe = true;
        next.needs = needsOptions(next);
      } else next.needs = reply.split(",").map((s) => s.trim()).filter(Boolean);
      continue;
    }
    if (/you decide|decide for me|you choose/i.test(reply)) {
      next.decideForMe = true;
      next.needs = needsOptions(next);
    }
    const q = parts.find((p) => p.type === "tool-ask_question")?.output?.question ?? "";
    if (/individual.*routine|routine.*individual/i.test(q)) {
      if (/routine/i.test(reply)) next.mode = "routine";
      else if (/individual|pick/i.test(reply)) next.mode = "individual";
    }
  }
  return next;
}

/** True when the app itself must now ask the "which kinds of products" question. */
export function needsQuestionDue(profile: Profile, messages: UIMessage[]): boolean {
  const { asked, askedNeeds } = questionState(messages);
  return (
    profile.mode === "individual" &&
    !profile.needs?.length &&
    !profile.decideForMe &&
    !askedNeeds &&
    asked < MAX_QUESTIONS &&
    !isWellnessOnly(profile)
  );
}

export function flowHint(profile: Profile, asked: number, messages: UIMessage[] = []): string {
  // (The app asks its own questions in a fixed order, so this only says when to recommend and how.)
  const groups = requiredGroups(profile);
  const wants = groups.length
    ? `\nThe customer chose these kinds of products. You MUST make exactly one recommend_products call for EACH of these groups, using the given kind and area: ${groups.map((g) => `${g.label} (kind: ${g.kind}, area: ${g.area ?? "none"})`).join("; ")}. Make all of these calls together in one go, and do not skip any.${profile.decideForMe ? " The customer asked you to decide, so give a COMPLETE set covering every group above, with 2 options per group (3 only when clearly different). Never narrow it down to one product." : ""}`
    : "";
  const notes: string[] = [];
  if (/hairline|parting/i.test(profile.hairPattern ?? ""))
    notes.push("Hair fall is mostly at the hairline or parting: lead with the hair-growth treatment, and say results usually take about 3 months of steady use.");
  if (/all over/i.test(profile.hairPattern ?? ""))
    notes.push("Hair fall is all over the head: lead with the hair-growth treatment. Mention that general shedding can come from stress, sleep, diet, iron or thyroid issues, so a doctor can help if it continues or gets worse.");
  if (/clumps/i.test(profile.hairPattern ?? ""))
    notes.push("The customer sees clumps of hair when washing or combing: lead with the hair-growth treatment, but also say that noticeable or sudden clumps can have medical causes, so they should see a doctor if it is heavy or lasts more than a few weeks (never diagnose).");
  if (/more than 6 months/i.test(profile.duration ?? ""))
    notes.push("This has lasted more than 6 months: mention that a dermatologist or doctor can help with long-standing concerns.");
  if (/strong actives/i.test(profile.history ?? ""))
    notes.push("They have already used strong actives: do not stack more strong actives on top, and advise starting slowly.");
  if ((profile.concerns ?? []).includes("tan"))
    notes.push("The customer wants tan removed. Sunscreen only PREVENTS more tan, it does not fade tan they already have: say that honestly. Lead with the exfoliating products that list tan as a concern, and add sunscreen for prevention.");
  if ((profile.concerns ?? []).includes("pigmentation") && (profile.bodyAreas ?? []).includes("face"))
    notes.push("The customer wants help with dark patches or pigmentation on the FACE. The Bodywise range has limited options for face pigmentation: say that plainly, recommend only what the tools return, and suggest a dermatologist for stubborn patches.");
  if (starterMode(profile, messages))
    notes.push("The customer was unsure about most questions: give a gentle, low-risk STARTER set (mild cleanser, moisturiser, and sunscreen where relevant, nothing strong) and say honestly that this is 'a good place to start', not a full plan.");
  const extra = notes.length ? `\n${notes.join("\n")}` : "";
  const head = `Questions asked so far for this request: ${asked} of ${MAX_QUESTIONS}. The app asks the questions itself, in a fixed order; you do not need to ask any.`;
  if (asked >= MAX_QUESTIONS || profile.decideForMe)
    return `${head}\nThe question limit is reached (or the customer asked you to decide). Do NOT ask anything more: pick sensible defaults yourself and recommend now.${wants}${extra}`;
  return `${head}\nWhen the app has no more questions, you recommend. Do not ask questions of your own unless the customer asks you something that needs a clarification.${wants}${extra}`;
}
