// Safety rules that read what the customer typed. Plain text matching only (no catalogue), so
// both the server and the browser can use it.

export const PREGNANCY_LINE = "Since you're pregnant, breastfeeding or trying to conceive, please check with your doctor before starting any new product. Ask Wise leaves out products it can't check automatically; that's caution, not a medical verdict.";

/** True if the customer says they are pregnant or nursing (but not "not pregnant", and not "post-pregnancy" alone). */
export function mentionsPregnancy(text: string): boolean {
  const t = text.toLowerCase();
  const negated = /(not|n't|no longer|never|am not|aren't|isn't)\s+(currently\s+)?(pregnan|expecting|nursing|breastfeed|breast-feed|lactating)/.test(t);
  if (negated) return false;
  const nursing = /(nursing|breastfeed|breast-feed|lactating|feeding my baby|trying to conceive)/.test(t);
  const pregnant = /(pregnan|expecting a baby|i'm expecting|i am expecting)/.test(t);
  const postOnly = /(post[- ]?pregnancy|postpartum|post[- ]?natal|after (my )?pregnancy|after (giving )?birth)/.test(t);
  if (nursing) return true;
  if (pregnant && !(postOnly && !/\b(am|i'm|currently|i m)\s+pregnan/.test(t))) return true;
  return false;
}

/**
 * Warning signs that need a doctor, not a product: severe/painful/cystic/scarring acne,
 * eczema, psoriasis, bleeding, spreading rash, infection.
 */
export function needsDoctor(text: string): boolean {
  const t = text.toLowerCase();
  const acne = /(acne|pimple|zit|breakout|break-out|cyst|nodul)/.test(t);
  const severity = /(severe|painful|cystic|nodul|scarring|leaving (permanent )?scars|permanent scar|inflamed and sore|bleeding)/.test(t);
  if (acne && severity) return true;
  if (/(cystic|nodular)/.test(t)) return true;
  if (/(eczema|psoriasis|dermatitis)/.test(t)) return true;
  if (/(bleeding|spreading rash|rash.*spread|pus\b|infection|infected|swollen and warm|fever)/.test(t)) return true;
  return false;
}

/** The latest user messages (a short window, so an old worry does not block a new request forever). */
export function recentUserText(messages: { role: string; parts: unknown[] }[], n = 3): string {
  return messages
    .filter((m) => m.role === "user")
    .slice(-n)
    .map((m) => (m.parts as { type: string; text?: string }[]).filter((p) => p.type === "text").map((p) => p.text ?? "").join(" "))
    .join(" \n ");
}

export function allUserText(messages: { role: string; parts: unknown[] }[]): string {
  return recentUserText(messages, 1000);
}

/** Dry or sensitive skin, from what the customer said or the saved skin type. */
export function dryOrSensitive(text: string, skinType?: string): boolean {
  if (skinType && /\b(dry|sensitive)\b/i.test(skinType)) return true;
  return /\b(dry|sensitive)\b[^.?!\n]{0,30}\bskin\b|\bskin\b[^.?!\n]{0,30}\b(dry|sensitive|flaky|tight)\b|\bsensitive\b/i.test(text);
}

/** Honest framing notes the customer should see next to results. */
export function wantsTan(text: string): boolean {
  return /\btan(ned|ning)?\b|suntan|de-tan/i.test(text);
}
export function facePigmentation(text: string): boolean {
  return /(pigmentation|dark (spots|patches|marks))/i.test(text) && /\b(face|facial|cheeks?|forehead|chin)\b/i.test(text);
}

/* ---------- Safety context: age, allergy, and a signature of what has been disclosed ---------- */
// Plain text rules shared by the server and the browser, so both always agree on what the
// customer has told us. Only what is needed to stay safe is read: an age BAND (under 18 or not),
// never a date of birth.

/** "minor" (under 18), "adult", or undefined when the customer has not said. */
export function ageBandFromText(text: string): "minor" | "adult" | undefined {
  const t = text.toLowerCase();
  if (/\bunder[- ]?18\b|\bteen(ager)?s?\b|\bminor\b|\bin (school|class \d+|grade \d+)\b/.test(t)) return "minor";
  const nums = [
    ...t.matchAll(/\b(\d{1,2})[\s-]*(?:(?:years?|yrs?)[\s-]*old|y\/?o|saal (?:ki|ka|ke))\b/g),
    ...t.matchAll(/\b(?:i'?m|i am|age[d]?|my age is|main)\s+(\d{1,2})\b(?!\s*(?:%|ml|g|days?|weeks?|months?|kg|cm))/g),
  ].map((m) => parseInt(m[1], 10));
  if (nums.some((n) => n >= 5 && n < 18)) return "minor";
  if (/\b18 (or|and) (over|above)\b|\b18\+|\bover 18\b|\badult\b/.test(t) || nums.some((n) => n >= 18 && n < 100)) return "adult";
  return undefined;
}

/** The customer says they have (or had) an allergy or a reaction, and did not say "no allergies". */
export function mentionsAllergy(text: string): boolean {
  const t = text.toLowerCase();
  const said = /\ballerg|\breact(ed|ion) to\b|\bbroke out (from|after)\b|\brash (from|after)\b|\bskin or ingredient allergy\b/.test(t);
  if (!said) return false;
  // "no allergies" / "not allergic" alone do not count
  const cleaned = t.replace(/\b(no|not|without|zero|don'?t have( any)?)\s+(known\s+)?(allergies|allergy|allergic)\b/g, "");
  return /\ballerg|\breact(ed|ion) to\b|\bbroke out (from|after)\b|\brash (from|after)\b/.test(cleaned);
}

export type SafetySignature = { pregnant: boolean; minor: boolean; allergy: boolean };

/** What the customer has disclosed so far. Flags only ever turn on (a later message cannot switch them off). */
export function safetySignature(text: string): SafetySignature {
  return { pregnant: mentionsPregnancy(text), minor: ageBandFromText(text) === "minor", allergy: mentionsAllergy(text) };
}
export const sigKey = (s: SafetySignature) => `${+s.pregnant}${+s.minor}${+s.allergy}`;
/** True when `now` discloses something that `then` did not (so earlier picks need re-checking). */
export const sigStricter = (then: SafetySignature, now: SafetySignature) =>
  (now.pregnant && !then.pregnant) || (now.minor && !then.minor) || (now.allergy && !then.allergy);
export function describeSig(s: SafetySignature): string {
  const bits = [s.pregnant && "pregnancy or breastfeeding", s.minor && "being under 18", s.allergy && "an allergy"].filter(Boolean) as string[];
  return bits.length > 1 ? `${bits.slice(0, -1).join(", ")} and ${bits[bits.length - 1]}` : bits[0] ?? "";
}

export const MINOR_LINE =
  "Because you're under 18, I only suggest gentle everyday basics, nothing medicated or strong. Please involve a parent or guardian, and see a doctor for acne, hair fall or anything that worries you.";
