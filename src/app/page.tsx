import Image from "next/image";
import Link from "next/link";
import { categoryStats } from "@/lib/catalogue";

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

export default function Home() {
  return (
    <main className="flex-1">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
        <span className="font-serif text-xl tracking-tight text-navy">
          Bodywise <span className="text-blue">Guide</span>
        </span>
        <Link
          href={CTA}
          className="rounded-full border border-navy/20 px-4 py-2 text-sm text-navy transition hover:bg-sky-2"
        >
          Find my routine
        </Link>
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
              className="rounded-full bg-navy px-8 py-4 text-base font-medium text-mist shadow-lg shadow-navy/15 transition hover:-translate-y-0.5 hover:bg-blue"
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
          <div className="mx-auto mt-6 w-fit animate-float rounded-full bg-white px-6 py-3 text-center text-navy shadow-xl shadow-navy/10 ring-1 ring-sky-2">
            <span className="font-serif text-2xl text-blue">4.8★</span>
            <span className="ml-2 text-sm">loved by thousands</span>
          </div>
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
