import type { ReactNode } from 'react';
import clsx from 'clsx';
import BrandMark from '@/components/Brand';

interface AuthLayoutProps {
  children: ReactNode;
  /** Card width on the form side. */
  maxW?: 'md' | 'lg';
}

const HIGHLIGHTS = [
  { value: 'R 0', label: 'Setup fees', sub: 'for parents' },
  { value: '24/7', label: 'Portal access', sub: 'payments & history' },
  { value: 'PDF', label: 'Receipts', sub: 'instant download' },
];

/**
 * Split-screen shell for auth pages: ink brand panel on the left (desktop),
 * form on warm paper to the right.
 */
export default function AuthLayout({ children, maxW = 'md' }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-paper">
      {/* Brand panel — desktop only */}
      <div className="relative hidden h-screen w-[46%] flex-col justify-between overflow-hidden bg-primary-900 p-12 lg:flex">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-accent-500/70" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-72 w-72 rounded-full border border-white/[0.06]" />

        <div className="relative flex items-center gap-3">
          <BrandMark className="h-10 w-10 text-lg" />
          <div>
            <p className="text-[13.5px] font-bold leading-tight text-white">Lambton Christian School</p>
            <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-accent-300">
              Finance Portal
            </p>
          </div>
        </div>

        <div className="relative">
          <p className="font-mono text-[9.5px] uppercase tracking-[0.18em] text-white/40">
            Fees · Payments · Statements
          </p>
          <h2 className="mt-4 max-w-md text-[34px] font-bold leading-[1.08] tracking-[-0.03em] text-white">
            Every rand of the school year,
            <span className="text-accent-300"> in one ledger.</span>
          </h2>
          <p className="mt-4 max-w-sm text-[13.5px] leading-relaxed text-white/60">
            Parents pay online, download receipts and statements; the bursar sees the same numbers
            at the same moment.
          </p>

          <div className="mt-10 grid max-w-md grid-cols-3 border-t border-white/15">
            {HIGHLIGHTS.map((h) => (
              <div key={h.label} className="border-r border-white/10 py-4 pr-3 last:border-r-0 last:pr-0">
                <p className="text-[19px] font-bold leading-none text-white">{h.value}</p>
                <p className="mt-1.5 text-[11.5px] font-semibold text-white/80">{h.label}</p>
                <p className="text-[10.5px] text-white/40">{h.sub}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative font-mono text-[9.5px] uppercase tracking-[0.14em] text-white/35">
          © {new Date().getFullYear()} Lambton Christian School
        </p>
      </div>

      {/* Form side */}
      <div className="flex flex-1 justify-center overflow-y-auto px-4">
        <div className={clsx('my-auto w-full py-12 animate-fade-up', maxW === 'lg' ? 'max-w-lg' : 'max-w-md')}>
          {/* Brand — mobile */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="h-10 w-10 text-lg" />
            <div>
              <p className="text-[13.5px] font-bold leading-tight text-ink">Lambton Christian School</p>
              <p className="mt-0.5 font-mono text-[9.5px] uppercase tracking-[0.18em] text-muted">
                Finance Portal
              </p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
