interface BrandMarkProps {
  className?: string;
}

/** Lambton Christian School brand mark — gold square, ink letter. */
export default function BrandMark({ className = 'h-10 w-10 text-lg' }: BrandMarkProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-[9px] bg-accent-500 font-extrabold tracking-[-0.02em] text-primary-950 ${className}`}
      aria-hidden="true"
    >
      L
    </div>
  );
}
