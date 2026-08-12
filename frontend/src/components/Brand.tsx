interface BrandMarkProps {
  className?: string;
}

/** Lambton Christian School gold-on-ink brand mark. */
export default function BrandMark({ className = 'h-10 w-10 text-lg' }: BrandMarkProps) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-accent-300 via-accent-400 to-accent-600 font-extrabold text-primary-950 shadow-lg shadow-black/25 ${className}`}
      aria-hidden="true"
    >
      L
    </div>
  );
}
