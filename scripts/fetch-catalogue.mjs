// Step 1 of the catalogue: download every product page listed in the
// official Be Bodywise sitemap and pull out the product facts that the
// page itself publishes. Nothing here is invented: every field is copied
// from the page's own structured data.
//
// Run:  node scripts/fetch-catalogue.mjs
// Output: data/raw-products.json  (pages are cached in data/.cache/)

import fs from "node:fs/promises";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "data", ".cache");
const OUT = path.join(ROOT, "data", "raw-products.json");
const SITEMAP = "https://bebodywise.com/sitemap-products.xml";
const UA = "Mozilla/5.0 (Macintosh) BodywiseGuideCatalogue/1.0";
const DELAY_MS = 800; // be polite to the brand's website
const refresh = process.argv.includes("--refresh");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`${res.status} for ${url}`);
  return res.text();
}

// Turn the site's HTML snippets into clean plain text.
export function clean(html) {
  if (html == null) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F2FF}]/gu, "")
    .replace(/[▶✔✓•]/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

const lines = (html) => clean(html).split("\n").filter(Boolean);

function extract(html, url) {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error("No product data found on page");
  const data = JSON.parse(m[1])?.props?.pageProps?.pageData?.data;
  const pi = data?.productInfo;
  if (!pi?.name) throw new Error("Page has no productInfo");

  const widgets = [
    ...(data.topLeftWidgets || []),
    ...(data.topRightWidgets || []),
    ...(data.widgets || []),
  ];
  const widget = (id) => widgets.find((w) => w.id === id);

  // Images from the product gallery (fall back to the thumbnail).
  const gallery = widget("pdp-hero-carousel-with-thumbnail")?.widgetData?.items || [];
  const images = gallery
    .map((i) => i?.media?.mediaType === "image" && i.media.source)
    .filter(Boolean)
    .map((s) => s.replace(/\?tr=.*$/, ""));
  if (!images.length && pi.prod_img) images.push(pi.prod_img.replace(/\?tr=.*$/, ""));

  // Key ingredients accordion: full ingredient list + important information.
  const kiList = widget("key-ingredients-accordion")?.widgetData?.list || [];
  const keyIngredientNotes = [];
  let fullIngredients = "";
  let formulatedWithout = "";
  let importantInfo = "";
  for (const item of kiList) {
    const title = clean(item.title);
    const text = clean(item.content);
    if (/full list/i.test(title)) {
      const parts = text.split(/Formulated Without/i);
      fullIngredients = parts[0].replace(/^Ingredient Names\s*/i, "").replace(/\n/g, " ").trim();
      formulatedWithout = (parts[1] || "").replace(/\n/g, ", ").replace(/^[,\s]+/, "").trim();
    } else if (/important information/i.test(title)) {
      importantInfo = text;
    } else if (title) {
      keyIngredientNotes.push({ name: title, note: text });
    }
  }

  // "How to use" visual steps (captions under the slides).
  const howSlides = (widget("how-it-works")?.widgetData?.items || [])
    .map((i) => clean(i?.media?.altText || i?.header?.title || ""))
    .filter(Boolean);

  const faqs = (data.meta?.faqsLdJson?.mainEntity || []).map((q) => ({
    q: clean(q.name),
    a: clean(q.acceptedAnswer?.text),
  }));

  const slug = pi.url_key || pi.urlKey || url.split("/product/")[1];

  // For kits: the bold product names listed after "What's Inside".
  const detailsHtml = String(data.description?.details?.text || pi.soDesc || "");
  const insideAt = detailsHtml.search(/inside|includes|contains|kit has/i);
  const kitItems =
    insideAt >= 0
      ? [...detailsHtml.slice(insideAt).matchAll(/<b>([^<]{4,90})<\/b>/g)]
          .map((m) => clean(m[1]).replace(/[:\-–]+$/, "").trim())
          .filter((t) => t && !/inside|step|routine|results?|how to/i.test(t))
      : [];

  return {
    id: slug,
    name: clean(pi.name),
    genericName: clean(pi.generic_name),
    subtitle: clean(pi.subtitle),
    url: pi.productUrl || url,
    category: pi.category || pi.rx_category || "",
    isKit: Boolean(pi.is_kit || pi.types?.kits),
    kitItems,
    // A discounted price of 0 on the site means "no discount", so the
    // selling price is then the regular listed price.
    price: [pi.discounted_price, pi.discountedPrice, pi.filterPrice, pi.price].find((v) => v > 0) ?? null,
    mrp: [pi.price, pi.actualPrice].find((v) => v > 0) ?? null,
    currency: data.meta?.currencyCode || "INR",
    outOfStock: Boolean(pi.out_of_stock || pi.outOfStock),
    discontinued: Boolean(pi.isProductDiscontinued),
    rating: pi.rating ? Number(pi.rating) : null,
    reviewCount: pi.users_reviewed ? Number(pi.users_reviewed) : null,
    images,
    concern: clean(pi.diagnosisConcern || pi.concern),
    productFor: clean(pi.productFor || pi.card_for_with?.For),
    highlightIngredients: clean(pi.card_for_with?.With),
    activeIngredients: (pi.doc_ingredients || []).map(clean).filter(Boolean),
    keyIngredientNotes,
    fullIngredients,
    formulatedWithout,
    benefits: (pi.doc_mode_of_action || []).map(clean).filter(Boolean),
    description: clean(data.description?.details?.text || pi.soDesc),
    usageSteps: lines(data.description?.usage?.text),
    usageInstructions: (pi.usage_instructions || []).map(clean).filter(Boolean),
    usageSlides: howSlides,
    usageFrequency: (pi.usage_frequency || []).map(clean).filter(Boolean),
    routineStep: clean(pi.recommended_step),
    expectations: (pi.doc_expectation_setting || []).map(clean).filter(Boolean),
    importantInfo,
    faqs,
    siteTags: (pi.tags || []).map(clean).filter(Boolean),
    diagnosisList: (pi.diagnosisList || []).map((d) => clean(d.concern)).filter(Boolean),
  };
}

async function main() {
  await fs.mkdir(CACHE, { recursive: true });
  const sitemap = await get(SITEMAP);
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].trim())
    .filter((u) => u.includes("/product/"));
  const unique = [...new Set(urls)];
  console.log(`Sitemap lists ${unique.length} product pages`);

  const products = [];
  const failures = [];
  let oldest = Date.now(); // prices are only as fresh as the OLDEST page used (cached pages keep their own date)
  for (const [i, url] of unique.entries()) {
    const slug = url.split("/product/")[1].replace(/[^a-z0-9-]/gi, "_");
    const file = path.join(CACHE, `${slug}.html`);
    try {
      let html;
      try {
        if (refresh) throw new Error("refresh");
        html = await fs.readFile(file, "utf8");
        oldest = Math.min(oldest, (await fs.stat(file)).mtimeMs);
      } catch {
        html = await get(url);
        await fs.writeFile(file, html);
        await sleep(DELAY_MS);
      }
      const p = extract(html, url);
      products.push(p);
      process.stdout.write(`\r${i + 1}/${unique.length} ${p.name.slice(0, 50).padEnd(50)}`);
    } catch (err) {
      failures.push({ url, error: String(err.message || err) });
    }
  }
  console.log(`\nExtracted ${products.length} products, ${failures.length} failed`);
  await fs.writeFile(
    OUT,
    JSON.stringify({ fetchedAt: new Date(oldest).toISOString(), products, failures }, null, 2),
  );
  console.log(`Saved ${path.relative(ROOT, OUT)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
