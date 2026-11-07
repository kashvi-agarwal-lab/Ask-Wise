// Safety rules that read what the customer typed. Plain text matching only (no catalogue), so
// both the server and the browser can use it.

export const PREGNANCY_LINE = "Since you're pregnant or nursing, check with your doctor before starting any new active.";

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
