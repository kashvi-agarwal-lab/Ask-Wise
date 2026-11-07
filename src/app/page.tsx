import Image from "next/image";
import Link from "next/link";
import { categoryStats, topRated, topKits, type Product } from "@/lib/catalogue";
import { CONCERN_LABELS } from "@/lib/concerns";
import ResumeChat from "@/components/resume-chat";
import CartLink from "@/components/cart-link";
import Star from "@/components/star";
import Price from "@/components/price";

const CTA = "/chat"; // The chat page is built in Part 3

const categories = [
  { key: "body", photo: "body", title: "Body care", blurb: "Body acne, dryness, rough skin, tan." },
  { key: "hair", photo: "hair", title: "Hair care", blurb: "Hair fall, thinning, scalp care." },
  { key: "face", photo: "face", title: "Face care", blurb: "Gentle cleansing and targeted fixes." },
  { key: "sun-protection", photo: "sun", title: "Sun protection", blurb: "Light, everyday SPF 50." },
  { key: "wellness", photo: "well", title: "Wellness", blurb: "Gummies for daily nutrition." },
] as const;

const steps = [
  { n: "01", title: "Tell us what's going on", text: "Describe your skin, hair or body concern in your own words. No forms, no jargon." },
  { n: "02", title: "Answer a few quick questions", text: "We only ask what we still need to know, one question at a time." },
  { n: "03", title: "Get verified picks", text: "Individual products or a full AM / PM / weekly routine, with the total cost." },
];

// Photos are pre-cropped (public/products/*.jpg) to show the whole product with no half-cut text.
const photoAlt: Record<string, string> = {
  body: "Be Bodywise 1% Salicylic Acid Body Wash",
  hair: "Be Bodywise Hair Growth Serum Roll-On",
  face: "Be Bodywise 2% Salicylic Acid Face Wash",
  sun: "Be Bodywise Ultra Light Sunscreen SPF 50+",
  well: "Be Bodywise Calcium Gummies",
};

function Photo({ id, className = "", priority = false }: { id: string; className?: string; priority?: boolean }) {
  return (
    <div className={`relative aspect-[2/3] overflow-hidden bg-sky ${className}`}>
      <Image
        src={`/products/${id}.jpg`}
        alt={photoAlt[id]}
        fill
        sizes="(min-width: 1024px) 220px, 45vw"
        className="object-cover"
        priority={priority}
      />
    </div>
  );
}

const POPULAR_CONCERNS = [
  "body-acne", "face-acne", "hair-fall", "dandruff", "dry-skin", "tan",
  "pigmentation", "underarm-darkness", "strawberry-skin", "stretch-marks", "cracked-heels", "sun-protection",
];

const FAQ = [
  ["Is this medical advice?", "No. Bodywise Guide suggests Be Bodywise products and explains how to use them. It can't diagnose anything. For bleeding, a spreading rash, signs of infection or anything severe or persistent, please see a dermatologist or doctor."],
  ["How does it choose products?", "Only from the real Be Bodywise range. Every product, price and photo comes from the catalogue, and the app checks each suggestion before showing it. The AI explains the choices but never makes up products."],
  ["Can I choose a size or scent?", "Yes. When a product comes in different sizes or scents, you pick yours on the card and the routine total updates."],
  ["Where do I buy?", "Each product has a Buy on Bodywise button that opens its page on bebodywise.com. Prices shown are as of the date on the page and can change on the site."],
  ["Do I need an account?", "No. There is nothing to sign up for, and your chat stays in your own browser."],
];

function ProductTile({ p }: { p: Product }) {
  return (
    <a
      href={p.url}
      target="_blank"
      rel="noopener noreferrer"
      className="reveal group flex flex-col overflow-hidden rounded-3xl bg-white ring-1 ring-sky-2/70 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-navy/10"
    >
      <div className="relative aspect-[4/3] bg-sky">
        <Image src={p.image} alt={p.displayName} fill sizes="(min-width: 1024px) 30vw, 50vw" className="object-cover" />
      </div>
      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="font-medium leading-snug text-navy">{p.displayName}</h3>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate">
          <Star className="h-3.5 w-3.5 text-blue" /> {p.rating} · {p.reviewCount} reviews
        </p>
        <div className="mt-auto flex items-center justify-between pt-3">
          <Price price={p.price} mrp={p.mrp} />
          <span className="rounded-full bg-blue px-3.5 py-1.5 text-xs font-medium text-white transition group-hover:bg-navy">Buy ↗</span>
        </div>
      </div>
    </a>
  );
}

export default function Home() {
  const tops = topRated(6);
  const kits = topKits(4);
  return (
    <main className="flex-1">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-5 sm:px-8">
        <span className="shrink-0 whitespace-nowrap font-serif text-lg tracking-tight text-navy sm:text-xl">
          Bodywise <span className="text-blue">Guide</span>
        </span>
        <div className="flex items-center gap-3">
          <CartLink className="px-3 text-sm sm:px-4 sm:py-2" />
          <Link
            href={CTA}
            className="whitespace-nowrap rounded-full border border-navy/20 px-3 py-1.5 text-sm text-navy transition hover:bg-sky-2 sm:px-4 sm:py-2"
          >
            <span className="hidden min-[400px]:inline">Find my routine</span>
            <span className="min-[400px]:hidden">Start chat</span>
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-2 lg:pt-16">
        <div className="animate-fade-up">
          <p className="mb-5 text-sm font-medium uppercase tracking-[0.2em] text-slate">
            Every body works wonders
          </p>
          <h1 className="font-serif text-5xl leading-[1.05] text-navy sm:text-6xl lg:text-7xl">
            Care that starts with <em className="text-blue">listening.</em>
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-navy/75">
            Chat with your personal skin and body-care consultant. Tell it what you need, and get
            verified Be Bodywise products or a complete routine, with the cost added up for you.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href={CTA}
              className="rounded-full bg-blue px-8 py-4 text-base font-medium text-mist shadow-lg shadow-navy/15 transition hover:-translate-y-0.5 hover:bg-navy"
            >
              Find my routine
            </Link>
            <span className="text-sm text-slate">Free · takes about 2 minutes</span>
          </div>
        </div>

        {/* Product collage */}
        <div className="mx-auto w-full max-w-md sm:max-w-lg">
        <div className="grid grid-cols-3 items-start gap-3 sm:gap-4">
          <Photo id="body" priority className="rounded-3xl animate-fade-up" />
          <Photo id="hair" className="mt-10 rounded-3xl animate-fade-up [animation-delay:0.15s]" />
          <Photo id="sun" className="rounded-3xl animate-fade-up [animation-delay:0.3s]" />
          </div>
        </div>
      </section>

      <ResumeChat />

      {/* Shop by concern */}
      <section className="mx-auto max-w-6xl px-5 pb-16 pt-4 sm:px-8">
        <h2 className="reveal font-serif text-3xl text-navy sm:text-4xl">What&apos;s on your mind?</h2>
        <p className="reveal mt-3 max-w-lg text-navy/70">Tap a concern and we&apos;ll start from there.</p>
        <div className="mt-6 flex flex-wrap gap-2.5">
          {POPULAR_CONCERNS.map((k) => (
            <Link
              key={k}
              href={`${CTA}?concern=${k}`}
              className="rounded-full border border-blue/30 bg-white px-4 py-2.5 text-sm text-navy transition hover:-translate-y-0.5 hover:border-blue hover:bg-sky"
            >
              {CONCERN_LABELS[k]}
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-sky/60 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="font-serif text-3xl text-navy sm:text-4xl">How it works</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.n} className="reveal rounded-3xl bg-white p-7 ring-1 ring-sky-2/50">
                <span className="font-serif text-3xl text-blue">{s.n}</span>
                <h3 className="mt-4 text-lg font-semibold text-navy">{s.title}</h3>
                <p className="mt-2 leading-relaxed text-navy/70">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="font-serif text-3xl text-navy sm:text-4xl">What are you looking for?</h2>
        <p className="mt-3 max-w-lg text-navy/70">
          Pick a place to begin, or just tell the guide in your own words.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-4 sm:gap-6 lg:grid-cols-5">
          {categories.map((c) => {
            const stats = categoryStats(c.key);
            return (
              <Link key={c.key} href={`${CTA}?category=${c.key}`} className="reveal group">
                <Photo id={c.photo} className="rounded-3xl transition duration-500 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:shadow-navy/10" />
                <h3 className="mt-4 font-serif text-xl text-navy">{c.title}</h3>
                <p className="mt-1 text-sm text-navy/65">{c.blurb}</p>
                <p className="mt-1 text-xs text-slate">
                  {stats.count} products · from ₹{stats.from}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Top rated */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <h2 className="reveal font-serif text-3xl text-navy sm:text-4xl">Customer favourites</h2>
        <p className="reveal mt-3 max-w-lg text-navy/70">The best-reviewed everyday products, rated by real customers on bebodywise.com.</p>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
          {tops.map((p) => (
            <ProductTile key={p.id} p={p} />
          ))}
        </div>
      </section>

      {/* Kits */}
      <section className="bg-sky/60 py-20">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="reveal font-serif text-3xl text-navy sm:text-4xl">Kits &amp; bundles</h2>
          <p className="reveal mt-3 max-w-lg text-navy/70">Several products in one pack, with the saving shown against the listed price.</p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {kits.map((k) => {
              const inside = (k.contains ?? []).map((c) => c.name).filter(Boolean);
              return (
                <a
                  key={k.id}
                  href={k.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="reveal group flex flex-col rounded-3xl bg-white p-5 ring-1 ring-sky-2/70 transition hover:-translate-y-1 hover:shadow-xl hover:shadow-navy/10"
                >
                  <h3 className="font-serif text-xl text-navy">{k.displayName}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink/75">
                    {inside.length >= 2 ? `Includes: ${inside.join(", ")}.` : "See the product page for what's inside."}
                  </p>
                  <div className="mt-auto flex items-center justify-between pt-4">
                    <Price price={k.price} mrp={k.mrp} />
                    <span className="rounded-full bg-blue px-3.5 py-1.5 text-xs font-medium text-white transition group-hover:bg-navy">Buy ↗</span>
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      </section>


      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-5 pb-20 sm:px-8">
        <h2 className="reveal font-serif text-3xl text-navy sm:text-4xl">Good to know</h2>
        <div className="mt-8 divide-y divide-sky-2 rounded-3xl bg-white px-6 ring-1 ring-sky-2/70">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-navy marker:hidden">
                {q}
                <span className="text-blue transition group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 leading-relaxed text-ink/75">{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* Final call to action */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-8">
        <div className="reveal rounded-[2.5rem] bg-navy px-8 py-14 text-center text-mist sm:py-20">
          <h2 className="mx-auto max-w-xl font-serif text-3xl sm:text-5xl">Ready for a routine that fits you?</h2>
          <Link
            href={CTA}
            className="mt-8 inline-block rounded-full bg-sky-2 px-8 py-4 font-medium text-navy transition hover:-translate-y-0.5 hover:bg-sky"
          >
            Find my routine
          </Link>
        </div>
      </section>

      <footer className="border-t border-sky-2/50 px-5 py-8 text-center text-xs leading-relaxed text-slate">
        Bodywise Guide gives product guidance, not medical advice. For persistent or severe skin or hair
        concerns, please see a dermatologist or doctor.
      </footer>
    </main>
  );
}
