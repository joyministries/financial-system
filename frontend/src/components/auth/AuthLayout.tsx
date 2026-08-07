import type { ReactNode } from 'react';
import clsx from 'clsx';
import BrandMark from '@/components/Brand';

interface AuthLayoutProps {
  children: ReactNode;
  /** Card width on the form side. */
  maxW?: 'md' | 'lg';
}

const HIGHLIGHTS = [
  { value: 'R 0', label: 'setup fees', sub: 'for parents' },
  { value: '24/7', label: 'portal access', sub: 'payments & history' },
  { value: 'PDF', label: 'receipts', sub: 'instant download' },
];

/**
 * Premium split-screen shell for auth pages: navy brand panel on the left
 * (desktop), centered form card on the right.
 */
export default function AuthLayout({ children, maxW = 'md' }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* Brand panel — desktop only */}
      <div className="relative hidden w-[46%] overflow-hidden bg-[#131d3c] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(700px_280px_at_85%_-10%,rgba(212,175,55,0.16),transparent),radial-gradient(600px_420px_at_0%_110%,rgba(59,99,194,0.28),transparent)]" />

        <div className="relative flex items-center gap-3">
          <BrandMark className="h-11 w-11 text-xl" />
          <div>
            <p className="font-display text-lg font-bold leading-tight text-white">Lambton Christian School</p>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-300">
              Finance Portal
            </p>
          </div>
        </div>

        <div className="relative">
          <h2 className="max-w-md text-3xl font-bold leading-tight text-white">
            Fees, payments and statements —{' '}
            <span className="text-accent-300">all in one place.</span>
          </h2>
          <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-300">
            Lambton Christian School's finance portal keeps parents and staff in sync — pay fees online,
            download receipts and statements, and follow every rand of the academic year.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-3 gap-3">
            {HIGHLIGHTS.map((h) => (
              <div
                key={h.label}
                className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm"
              >
                <p className="text-lg font-bold text-accent-300">{h.value}</p>
                <p className="mt-0.5 text-xs font-medium text-white">{h.label}</p>
                <p className="text-[11px] text-slate-400">{h.sub}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-slate-400">
          © {new Date().getFullYear()} Lambton Christian School. All rights reserved.
        </p>
      </div>

      {/* Form side */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className={clsx('w-full animate-fade-up', maxW === 'lg' ? 'max-w-lg' : 'max-w-md')}>
          {/* Brand — mobile */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark className="h-11 w-11 text-xl" />
            <div>
              <p className="font-display text-lg font-bold leading-tight text-slate-900">Lambton Christian School</p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-accent-600">
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
