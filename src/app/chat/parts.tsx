"use client";

import Image from "next/image";
import { createContext, useContext, useState } from "react";
import type { ProductCard, Routine, Variant } from "@/lib/engine";
import { CONCERN_LABELS } from "@/lib/concerns";
import Price from "@/components/price";

/* ---------- Shared actions (set by the chat page) ---------- */

export const CardContext = createContext<{
  onVariant: (oldId: string, v: Variant) => void;
  onAdd: (c: ProductCard) => void; // add to the routine being built in this chat
  onCart: (c: ProductCard) => void; // add to the cart (shared across chats)
  routineIds: Set<string>;
  cartIds: Set<string>;
  profileConcerns: string[];
  locked?: string; // set when these picks were replaced after a safety disclosure: no buying from them
  allergy?: boolean; // the customer mentioned an allergy: never suggest patch-testing
}>({ onVariant: () => {}, onAdd: () => {}, onCart: () => {}, routineIds: new Set(), cartIds: new Set(), profileConcerns: [] });

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
      className="inline-flex items-center gap-1 rounded-full bg-blue px-3.5 py-1.5 text-[13px] font-medium text-white transition hover:bg-navy"
    >
      Buy on Bodywise ↗
    </a>
  );
}

/* ---------- Small helpers ---------- */


function Expand({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <details className="group border-t border-sky-2/70 py-1.5 text-[13px]">
      <summary className="flex cursor-pointer list-none items-center justify-between font-medium text-navy marker:hidden">
        {title}
        <span className="text-blue transition group-open:rotate-45">+</span>
      </summary>
      <div className="mt-2 leading-relaxed text-ink/80">{children}</div>
    </details>
  );
}

// Catalogue photos are 4:3, so a 4:3 frame shows them whole (nothing cropped).
// If a photo fails to load (or is missing), the frame keeps its size and shows what the product is.
export function ProductThumb({ c, className = "w-24" }: { c: Pick<ProductCard, "name" | "image" | "type">; className?: string }) {
  const [failed, setFailed] = useState(!c.image);
  return (
    <div className={`relative aspect-[4/3] shrink-0 overflow-hidden rounded-2xl bg-sky ${className}`}>
      {failed ? (
        <span className="absolute inset-0 flex flex-col items-center justify-center px-1 text-center" role="img" aria-label={`${c.name} (photo unavailable)`}>
          <span className="font-serif text-2xl leading-none text-blue/70">{c.name.replace(/^be bodywise\s+/i, "").charAt(0)}</span>
          <span className="mt-1 line-clamp-1 text-[10px] capitalize text-slate">{c.type}</span>
        </span>
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

export function VariantPicker({ c }: { c: ProductCard }) {
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
  when,
  companion,
}: {
  c: ProductCard;
  when?: string; // how often to use it (routine view)
  companion?: boolean;
  why?: string;
  actions?: React.ReactNode;
  badge?: string;
  note?: string; // for the best pick: why it is best; for the others: when to choose them
}) {
  const { onAdd, onCart, routineIds, cartIds, profileConcerns, locked, allergy } = useContext(CardContext);
  const precautions = [
    ...c.precautions,
    c.isSupplement
      ? "Check with a doctor before starting any supplement."
      : allergy
        ? "You mentioned an allergy: check the full ingredient list on the pack, and ask a doctor if you're unsure. Don't test a product you may be allergic to."
        : "Patch-test on a small area for 24 hours before regular use.",
  ];
  // "Made for" only when the official page lists the concern as a main purpose; a secondary tag is
  // shown as supportive care, so a broad tag never reads as a promise.
  const primary = new Set(c.primaryKeys ?? []);
  const mine = (c.concernKeys ?? []).filter((k) => profileConcerns.includes(k));
  const matched = mine.filter((k) => primary.has(k)).map((k) => CONCERN_LABELS[k] ?? k);
  const supportive = c.primaryKeys ? mine.filter((k) => !primary.has(k)).map((k) => CONCERN_LABELS[k] ?? k) : [];
  const inRoutine = routineIds.has(c.id);
  const sizeText = c.size ? ` · ${c.size}` : "";

  return (
    <div className={`rounded-2xl bg-white p-3 shadow-sm shadow-navy/5 ${badge ? "ring-2 ring-blue" : "ring-1 ring-sky-2/70"}`}>
      {badge && (
        <span className="mb-1.5 inline-block rounded-full bg-blue px-2.5 py-0.5 text-[11px] font-medium tracking-wide text-white">★ {badge}</span>
      )}
      <div className="flex gap-3">
        <ProductThumb c={c} />
        <div className="min-w-0 flex-1 py-0.5">
          <p className="text-[15px] font-medium leading-snug text-navy">
            {c.name}
            {sizeText && <span className="font-normal text-slate">{sizeText}</span>}
          </p>
          {c.tagline && <p className="mt-0.5 line-clamp-1 text-[13px] text-slate">{c.tagline}</p>}
          <p className="mt-1 text-sm">
            <Price price={c.price} mrp={c.mrp} />
          </p>
          {c.rating ? <p className="mt-0.5 text-xs text-slate">★ {c.rating} · {c.reviewCount} reviews</p> : null}
        </div>
      </div>

      {(matched.length > 0 || supportive.length > 0 || c.actives.length > 0) && (
        <div className="mt-2 flex flex-wrap gap-1">
          {matched.map((m) => (
            <span key={m} className="rounded-full bg-sky px-2 py-0.5 text-[11px] text-navy">✓ Made for: {m}</span>
          ))}
          {supportive.map((m) => (
            <span key={m} className="rounded-full border border-sky-2 px-2 py-0.5 text-[11px] text-slate">Supportive for: {m}</span>
          ))}
          {c.actives.slice(0, 2).map((a) => (
            <span key={a} className="rounded-full border border-sky-2 px-2 py-0.5 text-[11px] text-slate">{a}</span>
          ))}
        </div>
      )}

      {when && (
        <p className="mt-2 rounded-2xl bg-mist px-3 py-2 text-sm leading-snug text-navy">
          <span className="font-medium">When: </span>
          {when}
          {companion && <span className="ml-1 text-xs text-slate">(added so the routine works)</span>}
        </p>
      )}

      <VariantPicker c={c} />

      {note && (
        <p className={`mt-2 rounded-xl px-3 py-2 text-[13px] leading-snug ${badge ? "bg-sky text-navy" : "text-slate"}`}>{note}</p>
      )}
      <div className="mt-2 px-1">
        {(why || (c.ingredientNotes?.length ?? 0) > 0) && (
          <Expand title="Why for you">
            {(c.ingredientNotes ?? []).map((n) => (
              <p key={n.name} className="mb-1">
                <span className="font-medium text-navy">{n.name}</span> is {n.note}.
              </p>
            ))}
            {why && <p className="mb-1">{why}</p>}
            <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium text-blue hover:underline">
              Read more on the official Be Bodywise page ↗
            </a>
          </Expand>
        )}
        {c.keyIngredients.length > 0 && <Expand title="Key ingredients">{c.keyIngredients.join("; ")}</Expand>}
        {c.howToUse.length > 0 && (
          <Expand title="How to use">
            <ul className="space-y-1">{c.howToUse.map((s) => <li key={s}>{s}</li>)}</ul>
          </Expand>
        )}
        <Expand title="Precautions">
          <ul className="list-disc space-y-1 pl-4">{precautions.map((s) => <li key={s}>{s}</li>)}</ul>
        </Expand>
        {locked ? (
          <p className="border-t border-sky-2/70 pb-0.5 pt-2.5 text-[13px] text-slate">{locked}</p>
        ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-sky-2/70 pb-0.5 pt-2.5">
          <span className="flex flex-wrap items-center gap-1.5">
            <BuyLink c={c} />
            <button
              onClick={() => onCart(c)}
              className="rounded-full border border-blue/40 px-3.5 py-1.5 text-[13px] font-medium text-blue transition hover:bg-sky"
            >
              {cartIds.has(c.id) ? "✓ In cart · add another" : "Add to cart"}
            </button>
            {!actions && (
              <button
                onClick={() => onAdd(c)}
                disabled={inRoutine}
                className="px-1 py-1.5 text-[13px] text-slate transition hover:text-blue disabled:text-slate/60"
              >
                {inRoutine ? "✓ In routine" : "+ Routine"}
              </button>
            )}
          </span>
          {actions}
        </div>
        )}
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

// Each product appears ONCE (with its own "when"), grouped by how often it is used.
const GROUP_ORDER = ["Morning", "Morning & evening", "Evening", "Daily", "2–3 times a week", "Once a week", "Supplements"];

function groupLabel(slots: string[]): string {
  const has = (s: string) => slots.includes(s);
  if (has("supplement")) return "Supplements";
  if (has("am") && has("pm")) return "Morning & evening";
  if (has("am")) return "Morning";
  if (has("pm")) return "Evening";
  if (has("daily")) return "Daily";
  if (has("alt")) return "2–3 times a week";
  return "Once a week";
}

export function routineGroups(r: Routine): { label: string; items: Routine["items"] }[] {
  const map = new Map<string, Routine["items"]>();
  for (const it of r.items) {
    const l = groupLabel(it.slots);
    map.set(l, [...(map.get(l) ?? []), it]);
  }
  return GROUP_ORDER.filter((l) => map.has(l)).map((l) => ({ label: l, items: map.get(l)! }));
}

export function routineText(r: Routine) {
  const lines = ["My Bodywise routine", ""];
  for (const g of routineGroups(r)) {
    lines.push(`${g.label.toUpperCase()}`);
    for (const it of g.items) {
      const variant = [it.size, it.variants?.find((v) => v.id === it.id)?.scent].filter(Boolean).join(", ");
      lines.push(`- ${it.name}${variant ? ` (${variant})` : ""}: ₹${it.price}`, `  When: ${it.when}`, `  Buy: ${it.url}`);
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
export function RoutineView({ r, onAsk, onRemove, onCartAll, locked }: { r: Routine; onAsk: (text: string) => void; onRemove: (id: string) => void; onCartAll: (r: Routine) => void; locked?: string }) {
  const ctx = useContext(CardContext);
  if (locked)
    return (
      <CardContext.Provider value={{ ...ctx, locked }}>
        <div className="flex flex-col gap-3">
          <div className="rounded-2xl border border-blue/30 bg-sky p-3 text-sm leading-relaxed text-navy">{locked}</div>
          <div className="pointer-events-none grid gap-3 opacity-60">
            {r.items.map((it) => <ProductCardView key={it.id} c={it} when={it.when} actions={<span />} />)}
          </div>
        </div>
      </CardContext.Provider>
    );
  return <RoutineViewLive r={r} onAsk={onAsk} onRemove={onRemove} onCartAll={onCartAll} />;
}

function RoutineViewLive({ r, onAsk, onRemove, onCartAll }: { r: Routine; onAsk: (text: string) => void; onRemove: (id: string) => void; onCartAll: (r: Routine) => void }) {
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

      {routineGroups(r).map((g) => {
        return (
          <section key={g.label}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-widest text-slate">{g.label}</h3>
            <div className="grid gap-3">
              {g.items.map((it) => {
                return (
                  <ProductCardView
                    key={g.label + it.id}
                    c={it}
                    when={it.when}
                    companion={it.companion}
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

      <button onClick={() => onCartAll(r)} className="rounded-full bg-blue py-3.5 text-center text-sm font-medium text-white transition hover:bg-navy">
        Add this whole routine to my cart
      </button>
      <a
        href={SHOP_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="-mt-2 rounded-full border border-blue/40 py-3 text-center text-sm font-medium text-blue transition hover:bg-sky"
      >
        Shop on bebodywise.com ↗
      </a>

      {r.notes?.length > 0 && (
        <ul className="space-y-1.5 rounded-2xl bg-sky p-3 text-sm leading-relaxed text-navy">
          {r.notes.map((n) => <li key={n}>{n}</li>)}
        </ul>
      )}

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
export function RoutineChatCard({ r, onOpen, onCartAll, locked, title = "Your routine" }: { r: Routine; onOpen: () => void; onCartAll: (r: Routine) => void; locked?: string; title?: string }) {
  return (
    <div className={`rounded-3xl bg-white p-4 ring-1 ring-sky-2/70 ${locked ? "opacity-70" : ""}`}>
      <p className="font-serif text-xl text-navy">{title}</p>
      <ul className="mt-2 space-y-1 text-sm text-ink/85">
        {routineGroups(r).map((g) => (
          <li key={g.label}>
            <span className="font-medium text-navy">{g.label}:</span> {g.items.map((i) => i.name).join(", ")}
          </li>
        ))}
      </ul>
      {locked ? (
        <p className="mt-3 border-t border-sky-2 pt-3 text-sm text-slate">{locked}</p>
      ) : (
      <>
      <div className="mt-3 flex items-center justify-between border-t border-sky-2 pt-3">
        <span>
          <span className="font-serif text-2xl text-navy">₹{r.total}</span>
          {r.savings > 0 && <span className="ml-2 text-xs text-blue">save ₹{r.savings}</span>}
        </span>
        <button onClick={onOpen} className="rounded-full bg-blue px-4 py-2 text-sm font-medium text-mist transition hover:bg-navy lg:hidden">
          See full routine
        </button>
        <span className="hidden text-xs text-slate lg:inline">Full routine is in the side panel →</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={() => onCartAll(r)} className="rounded-full bg-blue py-2.5 text-center text-sm font-medium text-white transition hover:bg-navy">
          Add to cart
        </button>
        <a href={SHOP_URL} target="_blank" rel="noopener noreferrer" className="rounded-full border border-blue/40 py-2.5 text-center text-sm font-medium text-blue transition hover:bg-sky">
          Shop on bebodywise.com ↗
        </a>
      </div>
      </>
      )}
    </div>
  );
}

/** Shown when the app re-checked earlier picks after the customer told it something new. */
export function RecheckCard({ about, flagged, keptCount }: { about: string; flagged: { id: string; name: string; reason: string }[]; keptCount: number }) {
  return (
    <div className="rounded-3xl border border-blue/30 bg-sky p-4 text-sm leading-relaxed text-navy">
      <p className="font-serif text-lg">Re-checked for {about || "what you told me"}</p>
      {flagged.length ? (
        <>
          <p className="mt-1 text-slate">These earlier picks are no longer suggested:</p>
          <ul className="mt-2 space-y-1.5">
            {flagged.map((f) => (
              <li key={f.id}>
                <span className="font-medium">{f.name}</span>: {f.reason}.
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-1">Nothing shown earlier was flagged.</p>
      )}
      {keptCount > 0 && <p className="mt-2 text-slate">{keptCount} earlier pick{keptCount === 1 ? " still fits" : "s still fit"}. The earlier cards above are marked as replaced, so buy from the updated suggestions.</p>}
      <p className="mt-2 text-xs text-slate">This is Ask Wise being cautious, not a medical verdict. Your doctor can advise on any product.</p>
    </div>
  );
}
