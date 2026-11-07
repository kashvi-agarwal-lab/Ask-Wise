// One price style everywhere: current price bold, MRP struck through, savings in a small pill.
export default function Price({ price, mrp, className = "" }: { price: number; mrp?: number | null; className?: string }) {
  const save = mrp && mrp > price ? mrp - price : 0;
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 whitespace-nowrap ${className}`}>
      <span className="font-semibold text-navy">₹{price}</span>
      {save > 0 && mrp && (
        <>
          <span className="text-xs text-slate line-through">₹{mrp}</span>
          <span className="rounded-full bg-aqua px-2 py-0.5 text-[11px] font-medium leading-none text-navy">
            Save ₹{save} ({Math.round((save / mrp) * 100)}%)
          </span>
        </>
      )}
    </span>
  );
}
