// Step 2 of the catalogue: turn the raw product facts into the clean
// catalogue the app uses (data/products.json).
//
// Tags (concerns, body areas, time of day...) are only added when the
// official product text supports them. Each tag keeps the exact sentence
// it came from, under "evidence", so anyone can check it.
//
// Run:  node scripts/build-catalogue.mjs
// Output: data/products.json and data/catalogue-report.md

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const RAW = path.join(ROOT, "data", "raw-products.json");
const OUT = path.join(ROOT, "data", "products.json");
const REPORT = path.join(ROOT, "data", "catalogue-report.md");

// ---------- Concern vocabulary ----------
// Each concern lists the phrases that must appear in official text.
const CONCERNS = {
  "body-acne": { label: "Body acne", re: /body acne|bacne|back acne|body breakouts?|acne on (the )?(back|chest|shoulders)/i },
  "face-acne": { label: "Face acne & pimples", re: /\bacne\b|pimple|breakouts?|zits?/i, only: ["face"] },
  "acne-marks": { label: "Acne marks", re: /acne marks|post[- ]acne|acne spots|blemish/i },
  "strawberry-skin": { label: "Strawberry skin & bumps (KP)", re: /strawberry|keratosis|\bKP\b|bumpy skin|bumps/i },
  "rough-texture": { label: "Rough or uneven texture", re: /rough|texture|dead skin|exfoliat|smooth(er|en)? skin|cell turnover/i, strict: true },
  "dry-skin": { label: "Dry or flaky skin", re: /\bdry skin|very dry|flaky|dryness|hydrat|moisturi[sz]/i, not: ["hair", "nutrition", "sleep"], strict: true },
  "cracked-heels": { label: "Cracked heels & rough feet", re: /heels?|cracked|foot|feet/i },
  "pigmentation": { label: "Pigmentation & dark patches", re: /pigment|dark (spots|patches|underarms?|marks)|uneven (skin )?tone|discolou?ration/i, strict: true },
  "tan": { label: "Tan", re: /\bde-?tan|\btan\b|tanning|tanned/i },
  "underarm-odour": { label: "Underarm odour", re: /odou?r|sweat|bacteria/i, needs: /underarm/i },
  "underarm-darkness": { label: "Dark underarms", re: /pigment|dark/i, needs: /underarm/i },
  "ingrown-hair": { label: "Ingrown hair", re: /ingrown/i },
  "sun-protection": { label: "Sun protection", re: /\bspf\b|sunscreen|sun protection|uva|uvb/i },
  "stretch-marks": { label: "Stretch marks", re: /stretch marks?/i },
  "skin-barrier": { label: "Weak skin barrier", re: /skin barrier|barrier (care|repair)|ceramide/i, strict: true },
  "aging": { label: "Fine lines & ageing", re: /fine lines|wrinkle|anti-?ag(e|ing)|ageing|aging|collagen|firm(er|ness)/i },
  "dullness": { label: "Dullness & glow", re: /\bglow|radian|dull(ness)?|brighten/i, not: ["hair"], strict: true },
  "puffiness": { label: "Puffiness", re: /puff(y|iness)/i },
  "facial-hair": { label: "Facial hair removal", re: /facial hair|peach fuzz|razor/i },
  "hair-fall": { label: "Hair fall & thinning", re: /hair ?fall|hair loss|thinning|hair growth|regrowth|stage \d hair/i },
  "dandruff": { label: "Dandruff & itchy scalp", re: /dandruff|itchy scalp|flaky scalp/i },
  "frizz-damage": { label: "Frizz & damaged hair", re: /frizz|damage(d)?( hair)?|unruly|split ends|smooth(er)? hair/i, only: ["hair"] },
  "dry-hair": { label: "Dry hair", re: /dry (&|and )?(frizzy )?hair|dry hair/i },
  "brows-lashes": { label: "Brow & lash growth", re: /brows?|lash(es)?/i },
  "sleep": { label: "Sleep", re: /\bsleep/i },
  "muscle-soreness": { label: "Muscle soreness & cramps", re: /muscle|cramps?|soreness/i },
  "energy-immunity": { label: "Energy & immunity", re: /energy|immunity|immune/i },
  "bone-health": { label: "Bone & joint health", re: /bones?|joints?/i },
};

// ---------- Body areas ----------
const AREAS = {
  face: /\bface|facial|facewash|pimple patch|ice roller/i,
  body: /\bbody|bodywash|whole body/i,
  back: /\bback\b|bacne|shoulders?/i,
  chest: /\bchest\b/i,
  arms: /\barms?\b/i,
  legs: /\blegs?\b|thighs?/i,
  underarms: /underarms?/i,
  feet: /\bfeet|foot|heels?/i,
  scalp: /scalp/i,
  hair: /\bhair\b/i,
  "brows-lashes": /brows?|lash/i,
  "bikini-area": /bikini|intimate/i,
};

const SUPPLEMENT = /gumm(y|ies)|tablets?|capsules?/i;

// Ingredient families that exfoliate or are strong actives. Used for
// gentle "don't layer too many at once" warnings.
const ACTIVES = [
  { key: "salicylic-acid", label: "Salicylic acid (BHA)", re: /salicylic|\bbha\b/i, exfoliant: true },
  { key: "glycolic-acid", label: "Glycolic acid (AHA)", re: /glycolic/i, exfoliant: true },
  { key: "lactic-acid", label: "Lactic acid (AHA)", re: /lactic/i, exfoliant: true },
  { key: "aha", label: "AHA", re: /\baha\b/i, exfoliant: true },
  { key: "benzoyl-peroxide", label: "Benzoyl peroxide", re: /benzoyl peroxide/i, exfoliant: true },
  { key: "urea", label: "Urea", re: /\burea\b/i, exfoliant: false },
  { key: "niacinamide", label: "Niacinamide", re: /niacinamide/i, exfoliant: false },
  { key: "ketoconazole", label: "Ketoconazole", re: /ketoconazole/i, exfoliant: false },
  { key: "zpto", label: "Zinc pyrithione (ZPTO)", re: /zpto|zinc pyrithione/i, exfoliant: false },
  { key: "ceramides", label: "Ceramides", re: /ceramide/i, exfoliant: false },
  { key: "redensyl", label: "Redensyl", re: /redensyl/i, exfoliant: false },
  { key: "biotin", label: "Biotin", re: /biotin/i, exfoliant: false },
  { key: "magnesium", label: "Magnesium", re: /magnesium/i, exfoliant: false },
];

// ---------- helpers ----------
const sentences = (text) =>
  String(text || "")
    .split(/\n|(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2);

function firstMatch(sources, re) {
  for (const { field, text } of sources) {
    for (const s of sentences(text)) if (re.test(s)) return { field, text: s.slice(0, 220) };
  }
  return null;
}

const baseName = (name) =>
  name
    .replace(/\(?\b\d+(\.\d+)?\s?(ml|mL|g|gm|N|n|pcs)\b\)?/g, "")
    .replace(/\(\s*\)|\s-\s*$|\s-\s-/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[\s\-–]+$/, "")
    .replace(/\s-\s(-\s)+/g, " – ")
    .replace(/\s-\s/g, " – ")
    .trim();

const sizeOf = (name) => (name.match(/\b\d+(\.\d+)?\s?(ml|mL|g|gm|N|pcs)\b/i) || [""])[0].replace(/\s/g, " ") || null;

const norm = (s) => s.toLowerCase().replace(/\b(flora|watermelon|aqua|oudh|no fragrance|fragrance free|frag free)\b/g, "").replace(/bodywash/g, "body wash").replace(/roll-on/g, "roll on").replace(/(\d)\.(\d)/g, "$1DOT$2").replace(/[^a-zA-Z0-9% ]/g, " ").replace(/DOT/g, ".").replace(/\s+/g, " ").trim();

function normaliseCategory(p) {
  const c = p.category.toLowerCase();
  if (c === "skin") return "face";
  if (c === "sun protection") return "sun-protection";
  if (c === "nutrition" || c === "sleep") return "wellness";
  if (SUPPLEMENT.test(p.name) && c !== "hair") return c === "face" ? "face" : "wellness";
  return c;
}

function productType(p) {
  const n = p.name.toLowerCase();
  if (p.isKit) return "kit";
  const types = [
    ["gummies", /gumm/],
    ["sunscreen", /sunscreen|spf/],
    ["face wash", /face ?wash/],
    ["body wash", /body ?wash/],
    ["shampoo", /shampoo/],
    ["conditioner", /conditioner/],
    ["roll-on", /roll[- ]?on/],
    ["serum", /serum/],
    ["scrub", /scrub/],
    ["lotion", /lotion/],
    ["cream", /cream/],
    ["moisturiser", /moisturi[sz]er/],
    ["body stick", /stick/],
    ["patch", /patch/],
    ["tool", /razor|roller|massager/],
  ];
  return (types.find(([, re]) => re.test(n)) || ["other"])[0];
}

function timeOfDay(sources) {
  const am = firstMatch(sources, /\bAM\b|morning|daytime|during the day|before (stepping|going) out|every day before sun/i);
  const pm = firstMatch(sources, /\bPM\b|night|bedtime|before (bed|sleep)|evening/i);
  return { am, pm };
}

function precautionsFor(p, category) {
  const out = [];
  if (/patch test/i.test(p.importantInfo) || p.keyIngredientNotes.some((n) => /patch test/i.test(n.note))) {
    out.push({
      text: "Do a patch test before first use: apply a little on the inner arm, wait 12–24 hours, and stop if you see redness, itching or irritation.",
      source: "official",
    });
  }
  for (const f of p.faqs) {
    const qa = `${f.q} ${f.a}`;
    if (/pregnan|breastfeed|nursing|sensitive|irritat|avoid|sun ?(exposure|screen)|doctor|dermatologist|children|kids|side effects?|broken skin|cuts|wounds|tingl/i.test(qa)) {
      out.push({ text: `${f.q} — ${f.a}`.slice(0, 400), source: "official FAQ" });
    }
  }
  if (category === "wellness" || SUPPLEMENT.test(p.name)) {
    out.push({
      text: "This is a dietary supplement, not a medicine. Check with a doctor before use if you are pregnant, breastfeeding, have a medical condition or take other medication.",
      source: "Bodywise Guide general guidance",
    });
  }
  return out;
}

// ---------- main ----------
async function main() {
  const raw = JSON.parse(await fs.readFile(RAW, "utf8"));
  const items = raw.products;
  const gaps = [];

  // The site sometimes repeats one product's "benefits" and "active
  // ingredients" on unrelated pages. Keep them only when the main active
  // named in the list also appears in this product's own name or highlights.
  for (const p of items) {
    const act = p.activeIngredients.join(" ");
    const main = (act.match(/[A-Za-z]{4,}/) || [""])[0].toLowerCase();
    const own = (p.name + " " + p.highlightIngredients).toLowerCase();
    if (main && !own.includes(main)) {
      p.activeIngredients = [];
      p.benefits = [];
      p.expectations = [];
    }
  }

  const built = items.map((p) => {
    const category = normaliseCategory(p);
    const titleText = [p.name, p.subtitle, p.productFor].join("\n");
    const primarySources = [
      { field: "name", text: p.name },
      { field: "subtitle", text: p.subtitle },
      { field: "productFor", text: p.productFor },
    ];
    const allSources = [
      ...primarySources,
      { field: "highlightIngredients", text: p.highlightIngredients },
      { field: "benefits", text: p.benefits.join("\n") },
      { field: "description", text: p.description },
      { field: "siteTags", text: p.siteTags.join("\n") },
      { field: "expectations", text: p.expectations.join("\n") },
    ];
    const usageSources = [
      { field: "usageSteps", text: p.usageSteps.join("\n") },
      { field: "usageInstructions", text: p.usageInstructions.join("\n") },
      { field: "usageSlides", text: p.usageSlides.join("\n") },
      { field: "usageFrequency", text: p.usageFrequency.join("\n") },
      { field: "keyIngredientNotes", text: p.keyIngredientNotes.map((n) => n.note).join("\n") },
      { field: "faqs", text: p.faqs.map((f) => `${f.q} ${f.a}`).join("\n") },
    ];

    // Concerns
    const concerns = [];
    const allText = allSources.map((s) => s.text).join("\n");
    for (const [key, c] of Object.entries(CONCERNS)) {
      if (c.only && !c.only.includes(category)) continue;
      if (c.not && c.not.includes(category)) continue;
      if (c.needs && !c.needs.test(titleText)) continue;
      const primary = firstMatch(primarySources, c.re);
      const pool = c.strict ? allSources.filter((x) => !["description", "expectations"].includes(x.field)) : allSources;
      const secondary = primary ? null : firstMatch(pool, c.re);
      const ev = primary || secondary;
      if (ev) concerns.push({ key, label: c.label, strength: primary ? "primary" : "secondary", evidence: ev });
    }
    // Hair products shouldn't pick up face-acne from "acne" mentions etc.
    const filtered = concerns.filter((c) => !(c.key === "face-acne" && concerns.some((x) => x.key === "body-acne" && x.strength === "primary") && !/face/i.test(titleText)));

    // Body areas
    const areas = [];
    for (const [key, re] of Object.entries(AREAS)) {
      const ev = firstMatch([...primarySources, { field: "description", text: p.description }, ...usageSources.slice(0, 2)], re);
      if (ev) areas.push({ key, evidence: ev });
    }
    if (category === "hair" && !areas.some((a) => a.key === "scalp" || a.key === "hair")) areas.push({ key: "hair", evidence: { field: "category", text: "hair" } });
    if (category === "face" && !areas.some((a) => a.key === "face") && !SUPPLEMENT.test(p.name)) areas.push({ key: "face", evidence: { field: "category", text: "face" } });

    if (SUPPLEMENT.test(p.name) && !p.isKit) areas.splice(0, areas.length, { key: "internal", evidence: { field: "type", text: "taken by mouth" } });

    // Actives
    const ingredientText = [p.name, p.highlightIngredients, p.activeIngredients.join(" "), p.fullIngredients].join(" ");
    const actives = ACTIVES.filter((a) => a.re.test(ingredientText)).map(({ key, label, exfoliant }) => ({ key, label, exfoliant }));

    const tod = timeOfDay(usageSources.filter((x) => x.field !== "faqs"));
    const precautions = precautionsFor(p, category);

    // Skin-type and suitability statements, copied word for word.
    const suitability = [];
    for (const s of sentences([p.description, ...p.faqs.map((f) => `${f.q} ${f.a}`)].join("\n"))) {
      if (/all skin types|sensitive skin|oily skin|dry skin types?|combination skin|skin types?|suitable for|safe for|pregnan|men\b|women|teen|age/i.test(s) && s.length < 300) suitability.push(s);
    }

    const missing = [];
    if (!p.fullIngredients && !p.highlightIngredients) missing.push("ingredients");
    if (!p.usageSteps.length && !p.usageInstructions.length) missing.push("usage instructions");
    if (!filtered.length) missing.push("concerns");
    if (!p.images.length) missing.push("image");
    if (missing.length) gaps.push({ id: p.id, name: p.name, missing });

    return {
      id: p.id,
      name: p.name,
      family: norm(baseName(p.isKit ? p.name : p.name)),
      displayName: baseName(p.name),
      size: sizeOf(p.name),
      category,
      type: productType(p),
      isKit: p.isKit,
      isSupplement: SUPPLEMENT.test(p.name),
      url: p.url,
      image: p.images[0] || null,
      images: p.images.slice(0, 6),
      price: p.price,
      mrp: p.mrp,
      currency: p.currency,
      available: !p.outOfStock && !p.discontinued,
      rating: p.rating,
      reviewCount: p.reviewCount,
      tagline: p.productFor || p.subtitle,
      subtitle: p.subtitle,
      description: p.description,
      benefits: p.benefits,
      highlightIngredients: p.highlightIngredients,
      keyIngredients: p.activeIngredients,
      fullIngredients: p.fullIngredients || null,
      formulatedWithout: p.formulatedWithout || null,
      actives,
      concerns: filtered,
      bodyAreas: areas,
      howToUse: p.usageSteps.length ? p.usageSteps : p.usageInstructions,
      usageFrequency: p.usageFrequency,
      routineStep: p.routineStep || null,
      timeOfDay: { am: tod.am, pm: tod.pm },
      expectations: p.expectations,
      suitability: [...new Set(suitability)].slice(0, 6),
      precautions,
      faqs: p.faqs,
      contains: [],
      _kitText: [p.description, ...p.kitItems].join("\n"),
    };
  });

  // Kit contents: only ever link to real single products in this catalogue.
  // Each line of the kit page is compared word by word with product names.
  // A line must contain the product's strength (e.g. "4%") and most of its words.
  const singles = built.filter((p) => !p.isKit);
  const families = [...new Set(singles.map((s) => s.family))];
  const STOP = new Set(["with", "for", "the", "and", "of", "a", "to", "in", "&"]);
  const tokens = (s) => norm(s).split(" ").filter((t) => t && !STOP.has(t));
  const overrides = JSON.parse(await fs.readFile(path.join(ROOT, "data", "kit-overrides.json"), "utf8").catch(() => "{}"));
  for (const kit of built.filter((p) => p.isKit)) {
    const found = new Map();
    for (const line of kit._kitText.split("\n")) {
      const lt = new Set(tokens(line));
      let best = null;
      for (const fam of families) {
        const ft = tokens(fam);
        if (ft.length < 2) continue;
        const pct = ft.filter((t) => /\d/.test(t));
        if (!pct.every((t) => lt.has(t))) continue;
        const score = ft.filter((t) => lt.has(t)).length / ft.length;
        if (score >= 0.75 && (!best || score > best.score || (score === best.score && ft.length > best.len))) best = { fam, score, len: ft.length };
      }
      if (best && !found.has(best.fam)) found.set(best.fam, line.slice(0, 200));
    }
    const nameOnly = [];
    for (const o of overrides[kit.id]?.contains || []) {
      if (o.family) { if (!found.has(o.family)) found.set(o.family, o.quote); }
      else nameOnly.push({ family: null, name: o.name, productIds: [], evidence: o.quote });
    }
    kit.contains = [...found].map(([fam, quote]) => {
      const options = singles.filter((s) => s.family === fam);
      if (!options.length) throw new Error(`Kit ${kit.id} lists unknown product family "${fam}"`);
      return { family: fam, name: options[0].displayName.replace(/\s–\s(Flora|Watermelon|Aqua|Oudh|No Fragrance|Fragrance free)$/i, ""), productIds: options.map((o) => o.id), evidence: quote };
    }).concat(nameOnly);
  }

  // Mark duplicate listings (same exact name and price) so search shows one.
  const byKey = new Map();
  for (const p of built) {
    const key = `${p.name}|${p.price}`;
    if (byKey.has(key)) p.duplicateOf = byKey.get(key);
    else byKey.set(key, p.id);
  }

  for (const p of built) delete p._kitText;

  const catalogue = {
    source: "https://bebodywise.com (official product pages listed in sitemap-products.xml)",
    pricesAsOf: raw.fetchedAt.slice(0, 10),
    note: "Generated by scripts/build-catalogue.mjs. Tags carry the official sentence they came from under 'evidence'. Precautions marked 'Bodywise Guide general guidance' are general safety advice, not product claims.",
    concernLabels: Object.fromEntries(Object.entries(CONCERNS).map(([k, v]) => [k, v.label])),
    products: built,
  };
  await fs.writeFile(OUT, JSON.stringify(catalogue, null, 2));

  // Report
  const byCat = {};
  for (const p of built) byCat[p.category] = (byCat[p.category] || 0) + 1;
  const concernCount = {};
  for (const p of built) for (const c of p.concerns) concernCount[c.label] = (concernCount[c.label] || 0) + 1;
  const report = [
    `# Catalogue report`,
    ``,
    `Built from the official Be Bodywise website. Prices as of **${catalogue.pricesAsOf}**.`,
    ``,
    `- Product pages: **${built.length}** (${built.filter((p) => p.isKit).length} kits, ${built.filter((p) => p.duplicateOf).length} duplicate listings hidden from search)`,
    `- Available now: **${built.filter((p) => p.available).length}**`,
    ``,
    `## By category`,
    ...Object.entries(byCat).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Products per concern`,
    ...Object.entries(concernCount).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    ``,
    `## Missing information (not invented — left blank)`,
    gaps.length ? gaps.map((g) => `- **${g.name}** (\`${g.id}\`): ${g.missing.join(", ")}`).join("\n") : "- None",
    ``,
    `## Kits and what they contain`,
    ...built.filter((p) => p.isKit).map((k) => `- **${k.name}**: ${k.contains.length ? k.contains.map((c) => c.name).join(" + ") : "_contents not listed on the page_"}`),
    ``,
  ].join("\n");
  await fs.writeFile(REPORT, report);
  console.log(`Wrote ${built.length} products to data/products.json`);
  console.log(`Gaps: ${gaps.length}. See data/catalogue-report.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
