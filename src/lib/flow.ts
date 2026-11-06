// The app (not the AI) decides how far along the questions are, because the small free
// AI model skips rules in long prompts. This text is added to the AI's instructions.
import type { UIMessage } from "ai";
import type { Profile } from "./prompt";
import type { Role } from "./catalogue";

export const MAX_QUESTIONS = 4;

const RESULT_TOOLS = ["tool-recommend_products", "tool-build_routine", "tool-update_routine"];

const HAIR = ["hair-fall", "dandruff", "frizz-damage", "dry-hair", "brows-lashes"];
const concernText = (profile: Profile) => (profile.concerns ?? []).join(" ").toLowerCase();
const isHair = (profile: Profile) => HAIR.some((k) => concernText(profile).includes(k)) || /hair|scalp|dandruff/.test(concernText(profile));
const isUnderarm = (profile: Profile) => /underarm|odour|odor|sweat/.test(concernText(profile));

/** The fixed "which kinds" choices, decided by the app from the customer's concern. */
export function needsOptions(profile: Profile): string[] {
  if (isHair(profile)) return ["Cleansing", "Treatment", "Conditioning"];
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
  return groups.slice(0, 8);
}

const QUESTION_TOOLS = ["tool-ask_question", "tool-ask_needs"];

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
 * Read the customer's latest answer to the questions the app asked, so the profile does not
 * depend on the AI remembering to save it.
 */
export function applyAnswers(profile: Profile, messages: UIMessage[]): Profile {
  // "You decide for me" counts only when the customer really said it (the AI used to set it
  // after an unrelated "Not sure"), so ignore the AI's own value and re-read the conversation.
  const next: Profile = { ...profile, decideForMe: undefined };
  for (let i = 1; i < messages.length; i++) {
    if (messages[i].role !== "user" || messages[i - 1].role !== "assistant") continue;
    const reply = textOf(messages[i]);
    if (!reply) continue;
    const parts = messages[i - 1].parts as { type: string; output?: { question?: string } }[];
    if (parts.some((p) => p.type === "tool-ask_needs")) {
      if (/decide/i.test(reply)) {
        // "You decide for me" = recommend EVERY kind of product that applies (cleansing, treatment, moisturising, sun protection...)
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

export function flowHint(profile: Profile, asked: number): string {
  // (The app asks the "which kinds of products" question itself, so it is not in this list.)
  const groups = requiredGroups(profile);
  const wants = groups.length
    ? `\nThe customer chose these kinds of products. You MUST make exactly one recommend_products call for EACH of these groups, using the given kind and area: ${groups.map((g) => `${g.label} (kind: ${g.kind}, area: ${g.area ?? "none"})`).join("; ")}. Make all of these calls together in one go, and do not skip any.${profile.decideForMe ? " The customer asked you to decide, so give a COMPLETE set covering every group above, with 2 options per group (3 only when clearly different). Never narrow it down to one product." : ""}`
    : "";
  const head = `Questions asked so far for this request: ${asked} of ${MAX_QUESTIONS}.`;
  if (asked >= MAX_QUESTIONS || profile.decideForMe)
    return `${head}\nThe question limit is reached (or the customer asked you to decide). Do NOT ask anything more: pick sensible defaults yourself and recommend now.${wants}`;

  const todo: string[] = [];
  if (!profile.bodyAreas?.length)
    todo.push("WHERE the concern is (face, body, scalp...). Skip if the customer already said, or it is obvious.");
  if (!profile.skinType)
    todo.push("SKIN TYPE (oily, dry, combination, normal, sensitive, not sure). Only for skin concerns.");
  if (!profile.mode)
    todo.push('MODE: "Would you like individual product picks, or a complete routine?" options ["Individual picks", "Complete routine"].');
  if (profile.pregnantOrNursing === undefined && !profile.sensitivities)
    todo.push(
      "SAFETY: anything to avoid (pregnant or nursing, very sensitive skin, allergies). Only when the likely products contain strong actives such as acids, benzoyl peroxide or hair-growth actives."
    );
  if (!todo.length) return `${head}\nYou know enough. Recommend now.${wants}`;
  return `${head}\nStill unknown, in priority order:\n${todo.map((t, i) => `${i + 1}. ${t}`).join("\n")}\nAsk ONLY the first item that is both unknown and relevant, with ask_question. If none is relevant, recommend now.${wants}`;
}
