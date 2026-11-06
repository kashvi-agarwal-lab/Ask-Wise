"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ProductCard, Variant } from "@/lib/engine";
import { CardContext, VariantPicker } from "../chat/parts";
import { addToCart, clearCart, decodeCart, encodeCart, removeLine, replaceId, setQty, useCart, type CartLine } from "@/lib/cart";

const SHOP_URL = "https://bebodywise.com/";
const PLAY_URL = "https://play.google.com/store/apps/details?id=com.mosaicwellness.bebodywise";
const APPLE_URL = "https://apps.apple.com/in/app/be-bodywise/id6446192851";

export default function CartView() {
  const router = useRouter();
  const own = useCart();
  const [shared, setShared] = useState<{ id: string; qty: number }[] | null>(null);
  const [ready, setReady] = useState(false);
  const [products, setProducts] = useState<Record<string, ProductCard>>({});
  const [copied, setCopied] = useState(false);

  // Is this a cart someone shared with us? (the cart is inside the web address)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("c");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (c) setShared(decodeCart(c));
    setReady(true);
  }, []);

  const isShared = shared !== null;
  const lines: CartLine[] = isShared ? shared.map((s) => ({ ...s, from: "Shared with you", chosen: true })) : own;
  const idKey = lines.map((l) => l.id).join(",");

  // Look up prices, photos and options for everything in the cart
  useEffect(() => {
    const ids = idKey ? idKey.split(",") : [];
    if (!ids.length) return;
    let cancelled = false;
    fetch("/api/products", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids }) })
      .then((r) => r.json())
      .then((d: { products: ProductCard[] }) => {
        if (!cancelled) setProducts((prev) => ({ ...prev, ...Object.fromEntries(d.products.map((p) => [p.id, p])) }));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [idKey]);

  const rows = lines.map((l) => ({ line: l, p: products[l.id] })).filter((r): r is { line: CartLine; p: ProductCard } => !!r.p);
  const total = rows.reduce((s, r) => s + r.p.price * r.line.qty, 0);
  const savings = rows.reduce((s, r) => s + (r.p.mrp ? (r.p.mrp - r.p.price) * r.line.qty : 0), 0);
  const count = rows.reduce((s, r) => s + r.line.qty, 0);

  const shareUrl = useMemo(
    () => (typeof window === "undefined" || !lines.length ? "" : `${window.location.origin}/cart?c=${encodeCart(lines)}`),
    [lines]
  );
  const shareText = `My Bodywise cart (₹${total}):\n${rows.map((r) => `- ${r.p.name}${r.p.size ? ` (${r.p.size})` : ""} x${r.line.qty}`).join("\n")}\n${shareUrl}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  const onVariant = (oldId: string, v: Variant) => replaceId(oldId, v.id);

  return (
    <div className="min-h-dvh bg-mist">
      <header className="flex items-center justify-between border-b border-sky-2/60 bg-white/80 px-4 py-3 backdrop-blur sm:px-6">
        <Link href="/" className="font-serif text-lg text-navy">
          Bodywise <span className="text-blue">Guide</span>
        </Link>
        <div className="flex gap-2">
          <Link href="/" className="rounded-full border border-navy/20 px-3 py-1.5 text-sm text-navy transition hover:bg-sky">Home</Link>
          <Link href="/chat" className="rounded-full border border-navy/20 px-3 py-1.5 text-sm text-navy transition hover:bg-sky">Chat</Link>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <h1 className="font-serif text-3xl text-navy sm:text-4xl">{isShared ? "A cart shared with you" : "Your cart"}</h1>
        <p className="mt-2 text-sm text-slate">
          {isShared
            ? "Someone shared these Bodywise picks with you. Add them to your own cart or open each one on Be Bodywise."
            : "Everything you've added from your chats, in one place. Your cart is saved in this browser."}
        </p>

        {ready && !lines.length && (
          <div className="mt-8 rounded-3xl bg-white p-8 text-center ring-1 ring-sky-2/70">
            <p className="font-serif text-xl text-navy">Your cart is empty</p>
            <p className="mt-2 text-sm text-slate">Chat with the guide and tap &ldquo;Add to cart&rdquo; on products or routines you like.</p>
            <Link href="/chat" className="mt-5 inline-block rounded-full bg-navy px-6 py-3 text-sm font-medium text-mist transition hover:bg-blue">
              Find my routine
            </Link>
          </div>
        )}

        {lines.length > 0 && (
          <CardContext.Provider value={{ onVariant, onAdd: () => {}, onCart: () => {}, routineIds: new Set(), cartIds: new Set(), profileConcerns: [] }}>
            <div className="mt-6 grid gap-3">
              {rows.map(({ line, p }) => (
                <div key={line.id} className="rounded-3xl bg-white p-3 ring-1 ring-sky-2/70">
                  <div className="flex gap-3">
                    <div className="relative aspect-[4/3] w-24 shrink-0 overflow-hidden rounded-2xl bg-sky">
                      <Image src={p.image} alt={p.name} fill sizes="100px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug text-navy">
                        {p.name}
                        {p.size && <span className="font-normal text-slate"> · {p.size}</span>}
                      </p>
                      <p className="mt-0.5 text-sm">
                        <span className="font-semibold text-navy">₹{p.price}</span>
                        {p.mrp && <span className="ml-1.5 text-xs text-slate line-through">₹{p.mrp}</span>}
                      </p>
                      <p className="mt-0.5 text-xs text-slate">{line.from}</p>
                    </div>
                  </div>

                  {!isShared && <VariantPicker c={{ ...p, chosen: line.chosen }} />}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1">
                    {isShared ? (
                      <span className="text-sm text-slate">Quantity: {line.qty}</span>
                    ) : (
                      <span className="inline-flex items-center overflow-hidden rounded-full border border-sky-2">
                        <button aria-label="Fewer" onClick={() => setQty(line.id, line.qty - 1)} className="px-3 py-1.5 text-navy transition hover:bg-sky">−</button>
                        <span className="min-w-8 text-center text-sm text-navy">{line.qty}</span>
                        <button aria-label="More" onClick={() => setQty(line.id, line.qty + 1)} className="px-3 py-1.5 text-navy transition hover:bg-sky">+</button>
                      </span>
                    )}
                    <span className="flex items-center gap-3">
                      <a href={p.url} target="_blank" rel="noopener noreferrer" className="rounded-full bg-blue px-4 py-2 text-sm font-medium text-white transition hover:bg-navy">
                        Buy ↗
                      </a>
                      {!isShared && (
                        <button onClick={() => removeLine(line.id)} className="text-sm text-slate hover:text-blue">Remove</button>
                      )}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContext.Provider>
        )}

        {rows.length > 0 && (
          <>
            <div className="mt-5 rounded-2xl bg-navy px-5 py-4 text-mist">
              <div className="flex items-center justify-between">
                <span>Total ({count} item{count === 1 ? "" : "s"})</span>
                <span className="font-serif text-3xl">₹{total}</span>
              </div>
              {savings > 0 && <p className="mt-1 text-sm text-aqua">You save ₹{savings} compared with MRP.</p>}
            </div>

            {/* Buying */}
            <section className="mt-6 rounded-3xl bg-white p-5 ring-1 ring-sky-2/70">
              <h2 className="font-serif text-xl text-navy">Buy on Be Bodywise</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate">
                Each product opens on bebodywise.com, where you add it to your bag. (Be Bodywise doesn&apos;t offer a one-tap link that fills a whole cart yet.)
              </p>
              <a href={SHOP_URL} target="_blank" rel="noopener noreferrer" className="mt-4 block rounded-full bg-blue py-3 text-center text-sm font-medium text-white transition hover:bg-navy">
                Go to bebodywise.com ↗
              </a>
              <p className="mt-4 text-sm text-slate">
                Prefer the app?{" "}
                <a href={PLAY_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-blue hover:underline">Get it on Google Play</a>
                {" · "}
                <a href={APPLE_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-blue hover:underline">App Store</a>
              </p>
            </section>

            {/* Share */}
            <section className="mt-4 rounded-3xl bg-white p-5 ring-1 ring-sky-2/70">
              <h2 className="font-serif text-xl text-navy">{isShared ? "Make it yours" : "Share this cart"}</h2>
              {isShared ? (
                <button
                  onClick={() => {
                    addToCart(rows.flatMap((r) => Array.from({ length: r.line.qty }, () => ({ id: r.p.id, from: "Shared with you", chosen: true }))));
                    setShared(null);
                    router.replace("/cart");
                  }}
                  className="mt-3 w-full rounded-full bg-navy py-3 text-sm font-medium text-mist transition hover:bg-blue"
                >
                  Add all to my cart
                </button>
              ) : (
                <>
                  <p className="mt-1 text-sm text-slate">Anyone with the link can see these products. Nothing else is shared.</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <button onClick={copyLink} className="rounded-full border border-navy/25 py-3 text-sm font-medium text-navy transition hover:bg-sky">
                      {copied ? "Link copied ✓" : "Copy link"}
                    </button>
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(shareText)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded-full border border-navy/25 py-3 text-center text-sm font-medium text-navy transition hover:bg-sky"
                    >
                      Share on WhatsApp
                    </a>
                  </div>
                  <button onClick={() => confirm("Remove everything from your cart?") && clearCart()} className="mt-4 text-sm text-slate hover:text-blue">
                    Clear cart
                  </button>
                </>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}
