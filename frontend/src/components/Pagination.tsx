import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}

export default function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...');
    }
  }

  return (
    <div className="flex flex-col items-center gap-2 border-t border-line-soft px-4 py-2.5 sm:flex-row sm:justify-between">
      {/* Left: record count + rows-per-page */}
      <div className="flex items-center gap-3">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-muted">
          {total === 0 ? (
            'No results'
          ) : (
            <>
              {from}–{to} of <span className="font-semibold text-ink">{total.toLocaleString()}</span>
            </>
          )}
        </p>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1); // reset to page 1 when size changes
              }}
              className="h-7 rounded-md border border-line bg-white px-1.5 text-[11.5px] text-body focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20"
            >
              {PAGE_SIZE_OPTIONS.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Right: page buttons */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          aria-label="Previous page"
          className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-[#d8d2c4] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-1 font-mono text-[11px] text-faint">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              aria-current={p === page ? 'page' : undefined}
              className={`h-7 min-w-[28px] rounded-md px-2 font-mono text-[11px] transition-colors ${
                p === page
                  ? 'bg-primary-900 font-semibold text-white'
                  : 'text-body hover:bg-[#f3efe6]'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || totalPages === 0}
          aria-label="Next page"
          className="rounded-md border border-line p-1.5 text-muted transition-colors hover:border-[#d8d2c4] hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
