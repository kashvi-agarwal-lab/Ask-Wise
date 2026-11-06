"use client";

// The cart lives in this browser only (like the chat). It is separate from any one chat, so
// products and routines from different chats can sit in it together.
import { useMemo, useSyncExternalStore } from "react";

export type CartLine = {
  id: string; // product id (this is the chosen size/scent)
  qty: number;
  from: string; // where it came from, e.g. "Back acne routine"
  chosen: boolean; // true once the customer picked the size/scent themselves
};

const KEY = "bodywise-guide-cart-v1";
const EVENT = "bodywise-cart";
const MAX_QTY = 9;

const raw = () => (typeof window === "undefined" ? "[]" : (localStorage.getItem(KEY) ?? "[]"));

function parse(s: string): CartLine[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((l) => l && typeof l.id === "string" && l.qty > 0) : [];
  } catch {
    return [];
  }
}

function write(lines: CartLine[]) {
  localStorage.setItem(KEY, JSON.stringify(lines));
  window.dispatchEvent(new Event(EVENT));
}

export function readCart(): CartLine[] {
  return parse(raw());
}

/** Add products. A product already in the cart just goes up by one. */
export function addToCart(items: { id: string; from: string; chosen?: boolean }[]) {
  const lines = readCart();
  for (const it of items) {
    const found = lines.find((l) => l.id === it.id);
    if (found) {
      found.qty = Math.min(MAX_QTY, found.qty + 1);
      found.chosen = found.chosen || !!it.chosen;
    } else lines.push({ id: it.id, qty: 1, from: it.from, chosen: !!it.chosen });
  }
  write(lines);
}

export function setQty(id: string, qty: number) {
  const q = Math.max(0, Math.min(MAX_QTY, qty));
  write(readCart().flatMap((l) => (l.id !== id ? [l] : q === 0 ? [] : [{ ...l, qty: q }])));
}

export function removeLine(id: string) {
  write(readCart().filter((l) => l.id !== id));
}

/** The customer chose another size or scent: swap the product, keeping the quantity. */
export function replaceId(oldId: string, newId: string) {
  const lines = readCart();
  const old = lines.find((l) => l.id === oldId);
  if (!old) return;
  const existing = lines.find((l) => l.id === newId && l !== old);
  if (existing) {
    existing.qty = Math.min(MAX_QTY, existing.qty + old.qty);
    write(lines.filter((l) => l !== old));
  } else write(lines.map((l) => (l === old ? { ...old, id: newId, chosen: true } : l))); // keeps its place in the list
}

export function clearCart() {
  write([]);
}

/** Live cart for React components (updates when anything changes it, even in another tab). */
export function useCart(): CartLine[] {
  const s = useSyncExternalStore(
    (cb) => {
      window.addEventListener(EVENT, cb);
      window.addEventListener("storage", cb);
      return () => {
        window.removeEventListener(EVENT, cb);
        window.removeEventListener("storage", cb);
      };
    },
    raw,
    () => "[]"
  );
  return useMemo(() => parse(s), [s]);
}

/* ---------- Share link: the cart is written into the web address itself (no database) ---------- */

export const encodeCart = (lines: { id: string; qty: number }[]) => lines.map((l) => `${l.id}:${l.qty}`).join(",");

export function decodeCart(s: string): { id: string; qty: number }[] {
  return s
    .split(",")
    .map((part) => {
      const [id, q] = part.split(":");
      const qty = Math.max(1, Math.min(MAX_QTY, parseInt(q ?? "1", 10) || 1));
      return { id: (id ?? "").slice(0, 120), qty };
    })
    .filter((l) => /^[a-z0-9-]+$/.test(l.id))
    .slice(0, 30);
}
