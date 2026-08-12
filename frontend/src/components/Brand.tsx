interface BrandMarkProps {
  className?: string;
}

/** Compact Ledger-style brand mark. */
export default function BrandMark({ className = 'h-10 w-10 text-lg' }: BrandMarkProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg border border-ledger-border bg-ledger-bg font-semibold text-primary-600 ${className}`}
      aria-hidden="true"
    >
      L
    </div>
  );
}
