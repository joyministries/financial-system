import { ChevronLeft, ChevronRight } from 'lucide-react';

const PAGE_SIZE_OPTIONS = [20, 50, 100];

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
    <div className="flex flex-col items-center gap-3 border-t border-ledger-border px-4 py-3 sm:flex-row sm:justify-between">
      <p className="text-sm text-ledger-muted">
        {total === 0 ? (
          'Showing 0 of 0'
        ) : (
          <>
            Showing <span className="font-medium text-ledger-ink">{from}-{to}</span> of{' '}
            <span className="font-medium text-ledger-ink">{total.toLocaleString()}</span>
          </>
        )}
      </p>

      <div className="flex flex-wrap items-center justify-end gap-3">
        {onPageSizeChange && (
          <label className="flex items-center gap-1.5 text-xs text-ledger-muted">
            Rows
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="rounded-md border border-ledger-border bg-ledger-surface px-2 py-1 text-xs text-ledger-ink"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>{size}</option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page === 1}
            className="rounded-lg p-2 text-ledger-muted hover:bg-ledger-row-hover disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          {pages.map((p, i) =>
            p === '...' ? (
              <span key={`dots-${i}`} className="px-2 text-ledger-muted">...</span>
            ) : (
              <button
                key={p}
                onClick={() => onPageChange(p)}
                className={`min-w-8 rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  p === page
                    ? 'font-semibold text-primary-600'
                    : 'font-normal text-ledger-ink hover:bg-ledger-row-hover'
                }`}
              >
                {p}
              </button>
            )
          )}

          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page === totalPages || totalPages === 0}
            className="rounded-lg p-2 text-ledger-muted hover:bg-ledger-row-hover disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
