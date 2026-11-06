"use client";

import Image from "next/image";
import { createContext, useContext, useState } from "react";
import type { ProductCard, Routine, Variant } from "@/lib/engine";
import { CONCERN_LABELS } from "@/lib/concerns";

/* ---------- Shared actions (set by the chat page) ---------- */

export const CardContext = createContext<{
  onVariant: (oldId: string, v: Variant) => void;
  onAdd: (c: ProductCard) => void;
  routineIds: Set<string>;
  profileConcerns: string[];
}>({ onVariant: () => {}, onAdd: () => {}, routineIds: new Set(), profileConcerns: [] });

/* ---------- Where customers actually buy ---------- */

// Every product card links to its own page on bebodywise.com (the URL comes from the catalogue).
// For a whole routine there is no ready-made cart link, so we also link to the main shop.
const SHOP_URL = "https://bebodywise.com/";

function BuyLink({ c }: { c: ProductCard }) {
  return (
    <a
      href={c.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full bg-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-navy"
    >
      Buy on Bodywise ↗
    </a>
  );
}

/* ---------- Small helpers ---------- */

function Price({ c }: { c: ProductCard }) {
  return (
    <span className="whitespace-nowrap">
      <span className="font-semibold text-navy">₹{c.price}</span>
      {c.mrp && <span className="ml-1.5 text-xs text-slate line-through">₹{c.mrp}</span>}
      {c.mrp && c.mrp > c.price && (
        <span className="ml-2 rounded-full bg-aqua px-2 py-0.5 text-xs font-medium text-navy">
          Save ₹{c.mrp - c.price} ({Math.round(((c.mrp - c.price) / c.mrp) * 100)}%)
        </span>
      )}
    </span>
  );
}

function Expand({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-sky-2/70 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-navy marker:hidden">
        {title}
        <span className="text-blue transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-2 leading-relaxed text-ink/80">{children}</div>
    </details>
  );
}

// Catalogue photos are 4:3, so a 4:3 frame shows them whole (nothing cropped).
function Thumb({ c, className = "w-28" }: { c: ProductCard; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`relative aspect-[4/3] shrink-0 overflow-hidden rounded-2xl bg-sky ${className}`}>
      {failed ? (
        <span className="absolute inset-0 flex items-center justify-center font-serif text-3xl text-blue/60">{c.name.charAt(0)}</span>
      ) : (
        <Image src={c.image} alt={c.name} fill sizes="120px" className="object-cover" onError={() => setFailed(true)} />
      )}
    </div>
  );
}

/* ---------- Size and scent picker ---------- */

const perUnit = (v: Variant) => {
  const m = v.size?.match(/^(\d+(?:\.\d+)?)\s?(mL|g)$/);
  return m ? { value: v.price / parseFloat(m[1]), unit: m[2] } : null;
};

function VariantPicker({ c }: { c: ProductCard }) {
  const { onVariant } = useContext(CardContext);
  const vs = c.variants ?? [];
  const current = vs.find((v) => v.id === c.id) ?? vs[0];
  if (!current || vs.length < 2) return null;

  const sizes = [...new Set(vs.map((v) => v.size).filter((s): s is string => !!s))];
  const scents = [...new Set(vs.map((v) => v.scent).filter((s): s is string => !!s))];

  // lowest price per mL/g among the sizes (for the "best value" hint)
  const unitBySize = new Map<string, { value: number; unit: string }>();
  for (const s of sizes) {
    const v = vs.filter((x) => x.size === s).sort((a, b) => a.price - b.price)[0];
    const u = perUnit(v);
    if (u) unitBySize.set(s, u);
  }
  const bestSize = unitBySize.size > 1 ? [...unitBySize.entries()].sort((a, b) => a[1].value - b[1].value)[0][0] : null;

  const pick = (size: string | null, scent: string | null) => {
    const exact = vs.find((v) => v.size === size && v.scent === scent);
    const sameSize = vs.find((v) => v.size === size);
    const sameScent = vs.find((v) => v.scent === scent);
    onVariant(c.id, exact ?? sameSize ?? sameScent ?? vs[0]);
  };

  const select = "w-full rounded-xl border border-sky-2 bg-white px-3 py-2 text-sm text-navy outline-none focus:border-blue";
  return (
    <div className="mt-2 grid gap-2 rounded-2xl bg-mist p-3">
      <p className="text-xs text-slate">
        Available in {[sizes.length > 1 && `${sizes.length} sizes`, scents.length > 1 && `${scents.length} scents`].filter(Boolean).join(" and ")}.
        {!c.chosen && <span className="ml-1 font-medium text-blue">Please choose yours:</span>}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {sizes.length > 1 && (
          <label className="text-xs text-slate">
            Size
            <select className={select} value={current.size ?? ""} onChange={(e) => pick(e.target.value, current.scent)}>
              {sizes.map((s) => {
                const u = unitBySize.get(s);
                const price = Math.min(...vs.filter((v) => v.size === s).map((v) => v.price));
                return (
                  <option key={s} value={s}>
                    {s} · ₹{price}
                    {u ? ` (₹${u.value.toFixed(1)}/${u.unit})` : ""}
                    {s === bestSize ? " · best value" : ""}
                  </option>
                );
              })}
            </select>
          </label>
        )}
        {scents.length > 1 && (
          <label className="text-xs text-slate">
            Scent
            <select className={select} value={current.scent ?? ""} onChange={(e) => pick(current.size, e.target.value)}>
              {scents.map((s) => {
                const here = vs.some((v) => v.scent === s && v.size === current.size);
                const where = [...new Set(vs.filter((v) => v.scent === s).map((v) => v.size))].filter(Boolean).join(" / ");
                return (
                  <option key={s} value={s} disabled={!here}>
                    {s}
                    {here ? "" : ` (only in ${where})`}
                  </option>
                );
              })}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}

/* ---------- Product card with expandable sections ---------- */

export function ProductCardView({
  c,
  why,
  actions,
  badge,
  note,
}: {
  c: ProductCard;
  why?: string;
  actions?: React.ReactNode;
  badge?: string;
  note?: string; // for the best pick: why it is best; for the others: when to choose them
}) {
  const { onAdd, routineIds, profileConcerns } = useContext(CardContext);
  const precautions = [
    ...c.precautions,
    c.isSupplement ? "Check with a doctor before starting any supplement." : "Patch-test on a small area for 24 hours before regular use.",
  ];
  const matched = (c.concernKeys ?? []).filter((k) => profileConcerns.includes(k)).map((k) => CONCERN_LABELS[k] ?? k);
  const inRoutine = routineIds.has(c.id);
  const sizeText = c.size ? ` · ${c.size}` : "";

  return (
    <div className={`rounded-3xl bg-white p-3 ${badge ? "ring-2 ring-blue" : "ring-1 ring-sky-2/70"}`}>
      {badge && (
        <span className="mb-2 ml-1 inline-block rounded-full bg-blue px-3 py-1 text-xs font-medium tracking-wide text-white">★ {badge}</span>
      )}
      <div className="flex gap-3">
        <Thumb c={c} />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="font-medium leading-snug text-navy">
            {c.name}
            {sizeText && <span className="font-normal text-slate">{sizeText}</span>}
          </p>
          <p className="mt-0.5 text-sm">
            <Price c={c} />
          </p>
          {c.rating ? <p className="mt-0.5 text-xs text-slate">★ {c.rating} ({c.reviewCount} reviews)</p> : null}
        </div>
      </div>

      {(matched.length > 0 || c.actives.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1.5 px-1">
          {matched.map((m) => (
            <span key={m} className="rounded-full bg-sky px-2.5 py-1 text-xs text-navy">✓ Matches your concern: {m}</span>
          ))}
          {c.actives.slice(0, 2).map((a) => (
            <span key={a} className="rounded-full border border-sky-2 px-2.5 py-1 text-xs text-slate">Contains {a}</span>
          ))}
        </div>
      )}

      <VariantPicker c={c} />

      {note && (
        <p className={`mt-2 rounded-2xl px-3 py-2 text-sm leading-snug ${badge ? "bg-sky text-navy" : "text-slate"}`}>{note}</p>
      )}
      <div className="mt-2 px-1">
        {why && <Expand title="Why for you">{why}</Expand>}
        {c.keyIngredients.length > 0 && <Expand title="Key ingredients">{c.keyIngredients.join("; ")}</Expand>}
        {c.howToUse.length > 0 && (
          <Expand title="How to use">
            <ul className="space-y-1">{c.howToUse.map((s) => <li key={s}>{s}</li>)}</ul>
          </Expand>
        )}
        <Expand title="Precautions">
          <ul className="list-disc space-y-1 pl-4">{precautions.map((s) => <li key={s}>{s}</li>)}</ul>
        </Expand>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-2/70 pb-1 pt-3">
          <span className="flex flex-wrap items-center gap-2">
            <BuyLink c={c} />
            {!actions && (
              <button
                onClick={() => onAdd(c)}
                disabled={inRoutine}
                className="rounded-full border border-blue/40 px-4 py-2 text-sm font-medium text-blue transition hover:bg-sky disabled:border-sky-2 disabled:text-slate"
              >
                {inRoutine ? "✓ In your routine" : "+ Add to my routine"}
              </button>
            )}
          </span>
          {actions}
        </div>
      </div>
    </div>
  );
}

/* ---------- Compare table ---------- */

type Detail = ProductCard & { allConcerns?: string[]; exfoliant?: boolean; error?: string };

export function CompareTable({ products }: { products: Detail[] }) {
  const ok = products.filter((p) => !p.error);
  if (ok.length < 2) return null;
  const rows: [string, (p: Detail) => string][] = [
    ["Price", (p) => `₹${p.price}${p.size ? ` · ${p.size}` : ""}`],
    ["Type", (p) => p.type],
    ["Made for", (p) => p.concerns.slice(0, 3).join(", ") || "—"],
    ["Key ingredients", (p) => p.keyIngredients.join("; ") || "—"],
    ["Exfoliating", (p) => (p.exfoliant ? "Yes" : "No")],
    ["How to use", (p) => p.howToUse[0] ?? "—"],
  ];
  return (
    <div className="overflow-x-auto rounded-3xl bg-white p-3 ring-1 ring-sky-2/70">
      <table className="w-full min-w-[420px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr>
            <th className="w-24" />
            {ok.map((p) => (
              <th key={p.id} className="px-2 pb-2 align-bottom font-medium text-navy">{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, fn]) => (
            <tr key={label}>
              <td className="border-t border-sky-2/70 py-2 pr-2 text-xs uppercase tracking-wide text-slate">{label}</td>
              {ok.map((p) => (
                <td key={p.id} className="border-t border-sky-2/70 px-2 py-2 align-top text-ink/85">{fn(p)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Routine ---------- */

const SLOT_LABEL: [keyof Pick<Routine, "am" | "pm" | "weekly" | "supplement">, string][] = [
  ["am", "Morning"],
  ["pm", "Evening"],
  ["weekly", "Weekly"],
  ["supplement", "Supplements"],
];

export function routineText(r: Routine) {
  const lines = ["My Bodywise routine", ""];
  for (const [key, label] of SLOT_LABEL) {
    const ids = r[key];
    if (!ids.length) continue;
    lines.push(`${label.toUpperCase()}`);
    for (const id of ids) {
      const it = r.items.find((x) => x.id === id)!;
      const variant = [it.size, it.variants?.find((v) => v.id === it.id)?.scent].filter(Boolean).join(", ");
      lines.push(`- ${it.name}${variant ? ` (${variant})` : ""}: ₹${it.price}`, `  Buy: ${it.url}`);
    }
    lines.push("");
  }
  lines.push(`Total (one of each): ₹${r.total}`);
  if (r.savings > 0) lines.push(`You save ₹${r.savings} vs MRP.`);
  lines.push(`Prices as of ${r.pricesAsOf}.`, `Shop: ${SHOP_URL}`, "");
  if (r.startSlow?.length) lines.push("START SLOWLY", ...r.startSlow.map((s) => `- ${s}`), "");
  for (const w of r.warnings) lines.push(`* ${w}`);
  return lines.join("\n");
}

/** Full routine: used in the side panel (desktop) and the bottom sheet (mobile). */
export function RoutineView({ r, onAsk, onRemove }: { r: Routine; onAsk: (text: string) => void; onRemove: (id: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(routineText(r));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  const exfoliantWarnings = r.warnings.filter((w) => /^(Exfoliant layering|Benzoyl peroxide|Scrub plus acids)/.test(w));
  const otherWarnings = r.warnings.filter((w) => !exfoliantWarnings.includes(w));
  const unchosen = r.items.filter((i) => (i.variants?.length ?? 0) > 1 && !i.chosen);

  return (
    <div className="flex flex-col gap-5">
      {unchosen.length > 0 && (
        <div className="rounded-2xl border border-blue/30 bg-sky p-3 text-sm leading-relaxed text-navy">
          <span className="font-semibold">Choose your options: </span>
          {unchosen.map((i) => i.name).join(", ")} come{unchosen.length === 1 ? "s" : ""} in more than one size or scent. Pick yours on the card and the total will update.
        </div>
      )}
      {exfoliantWarnings.map((w) => (
        <div key={w} className="rounded-2xl border border-blue/30 bg-sky p-3 text-sm leading-relaxed text-navy">
          <span className="font-semibold">Go gently: </span>
          {w.replace(/^Exfoliant layering: /, "")}
        </div>
      ))}

      {SLOT_LABEL.map(([key, label]) => {
        const ids = r[key];
        if (!ids.length) return null;
        return (
          <section key={key}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-slate">{label}</h3>
            <div className="grid gap-3">
              {ids.map((id) => {
                const it = r.items.find((x) => x.id === id)!;
                return (
                  <ProductCardView
                    key={key + id}
                    c={it}
                    actions={
                      <span className="flex gap-3 text-sm">
                        <button onClick={() => onAsk(`Suggest alternatives for ${it.name} in my routine`)} className="text-slate hover:text-blue">
                          Alternatives
                        </button>
                        <button onClick={() => onRemove(it.id)} className="text-slate hover:text-blue">
                          Remove
                        </button>
                      </span>
                    }
                  />
                );
              })}
            </div>
          </section>
        );
      })}

      <div className="rounded-2xl bg-navy px-5 py-4 text-mist">
        <div className="flex items-center justify-between">
          <span>Total (one of each)</span>
          <span className="font-serif text-3xl">₹{r.total}</span>
        </div>
        {r.savings > 0 && <p className="mt-1 text-sm text-aqua">You save ₹{r.savings} compared with MRP.</p>}
      </div>

      <a
        href={SHOP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="rounded-full bg-blue py-3.5 text-center text-sm font-medium text-white transition hover:bg-navy"
      >
        Shop your routine on bebodywise.com ↗
      </a>

      {r.startSlow?.length > 0 && (
        <section className="rounded-2xl border border-sky-2 bg-white p-4">
          <h3 className="font-serif text-lg text-navy">Start slowly</h3>
          <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-ink/80">
            {r.startSlow.map((s) => <li key={s}>{s}</li>)}
          </ul>
        </section>
      )}

      <ul className="list-disc space-y-1.5 pl-5 text-xs leading-relaxed text-slate">
        {otherWarnings.map((w) => <li key={w}>{w}</li>)}
        <li>Prices as of {r.pricesAsOf}.</li>
      </ul>

      <div className="grid grid-cols-2 gap-2">
        <button onClick={copy} className="rounded-full border border-navy/25 py-3 text-sm font-medium text-navy transition hover:bg-sky">
          {copied ? "Copied ✓" : "Copy summary"}
        </button>
        <a
          href={`https://wa.me/?text=${encodeURIComponent(routineText(r))}`}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-navy/25 py-3 text-center text-sm font-medium text-navy transition hover:bg-sky"
        >
          Share on WhatsApp
        </a>
      </div>
    </div>
  );
}

/** Compact version shown inside the chat message. */
export function RoutineChatCard({ r, onOpen }: { r: Routine; onOpen: () => void }) {
  return (
    <div className="rounded-3xl bg-white p-4 ring-1 ring-sky-2/70">
      <p className="font-serif text-xl text-navy">Your routine</p>
      <ul className="mt-2 space-y-1 text-sm text-ink/85">
        {SLOT_LABEL.map(([key, label]) => {
          const names = r[key].map((id) => r.items.find((x) => x.id === id)!.name);
          return names.length ? (
            <li key={key}>
              <span className="font-medium text-navy">{label}:</span> {names.join(", ")}
            </li>
          ) : null;
        })}
      </ul>
      <div className="mt-3 flex items-center justify-between border-t border-sky-2 pt-3">
        <span>
          <span className="font-serif text-2xl text-navy">₹{r.total}</span>
          {r.savings > 0 && <span className="ml-2 text-xs text-blue">save ₹{r.savings}</span>}
        </span>
        <button onClick={onOpen} className="rounded-full bg-navy px-4 py-2 text-sm font-medium text-mist transition hover:bg-blue lg:hidden">
          See full routine
        </button>
        <span className="hidden text-xs text-slate lg:inline">Full routine is in the side panel →</span>
      </div>
      <a href={SHOP_URL} target="_blank" rel="noopener noreferrer" className="mt-3 block rounded-full border border-blue/40 py-2.5 text-center text-sm font-medium text-blue transition hover:bg-sky">
        Shop on bebodywise.com ↗
      </a>
    </div>
  );
}
