"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart";

const CartIcon = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 4h2.2l2.1 10.2a1.5 1.5 0 0 0 1.5 1.2h8.2a1.5 1.5 0 0 0 1.5-1.1L20 8H6.2" />
    <circle cx="9.5" cy="19.2" r="1.2" />
    <circle cx="17" cy="19.2" r="1.2" />
  </svg>
);

/** "Cart (3)" button for the page headers. With compact, phones see just a cart icon. */
export default function CartLink({ className = "px-3 text-sm", compact = false }: { className?: string; compact?: boolean }) {
  const lines = useCart();
  const count = lines.reduce((s, l) => s + l.qty, 0);
  return (
    <Link
      href="/cart"
      className={`inline-flex min-h-[34px] items-center justify-center whitespace-nowrap rounded-full border border-navy/20 py-1.5 text-navy transition hover:bg-sky ${className}`}
      aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
    >
      {compact && (
        <span className="sm:hidden">
          <CartIcon />
        </span>
      )}
      <span className={compact ? "hidden sm:inline" : ""}>Cart</span>
      {count > 0 && <span className="ml-1.5 rounded-full bg-blue px-1.5 py-0.5 text-xs leading-none text-white">{count}</span>}
    </Link>
  );
}
