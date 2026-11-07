// Compares each product's ingredient copy in data/products.json with the official Be Bodywise
// page (the cached copy in data/.cache). Prints every product where the page's own title or
// description names actives that the catalogue's highlight text does not mention.
import fs from "node:fs";
const products = JSON.parse(fs.readFileSync("data/products.json", "utf8")).products;
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"');
const ACTIVES = ["redensyl", "procapil", "baicapil", "aminexil", "anagain", "rosemary", "biotin", "salicylic", "glycolic", "lactic", "niacinamide", "benzoyl peroxide", "ketoconazole", "zpto", "urea", "ceramide", "peptide", "magnesium", "caffeine", "keratin", "argan", "collagen", "glutathione", "vitamin c", "retinol", "hyaluronic", "aha", "bha"];
const rows = [];
for (const p of products) {
  const f = `data/.cache/${p.id}.html`;
  if (!fs.existsSync(f)) continue;
  const html = fs.readFileSync(f, "utf8");
  const title = decode((html.match(/<title>([^<]*)<\/title>/) || [])[1] || "");
  const desc = decode((html.match(/<meta name="description" content="([^"]*)"/) || [])[1] || "");
  const page = (title + " " + desc).toLowerCase();
  const ours = [p.name, p.highlightIngredients || "", (p.keyIngredients || []).join(" ")].join(" ").toLowerCase();
  const onPage = ACTIVES.filter((a) => page.includes(a));
  const missing = onPage.filter((a) => !ours.includes(a));
  if (missing.length) rows.push({ id: p.id, title, ours: p.highlightIngredients, missing });
}
console.log(JSON.stringify(rows, null, 1));
console.error(rows.length + " products differ");
