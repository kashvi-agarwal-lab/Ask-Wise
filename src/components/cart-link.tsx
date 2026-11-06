"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

/** "Cart (3)" button for the page headers. */
export default function CartLink({ className = "" }: { className?: string }) {
  const lines = useCart();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  return (
    <Link
      href="/cart"
      className={`rounded-full border border-navy/20 px-3 py-1.5 text-sm text-navy transition hover:bg-sky ${className}`}
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
    >
      Cart{count > 0 && <span className="ml-1.5 rounded-full bg-blue px-1.5 py-0.5 text-xs text-white">{count}</span>}
    </Link>
  );
}
