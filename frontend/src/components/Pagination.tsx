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
    <div className="flex flex-col items-center gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-between">

      {/* Left: record count + rows-per-page */}
      <div className="flex items-center gap-3">
        <p className="text-sm text-slate-500">
          {total === 0
            ? 'No results'
            : <>Showing <span className="font-medium text-slate-700">{from}–{to}</span> of <span className="font-medium text-slate-700">{total.toLocaleString()}</span></>
          }
        </p>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400">Rows</span>
            <select
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1); // reset to page 1 when size changes
              }}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
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
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>

        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="px-2 text-slate-400">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[36px] rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                p === page
                  ? 'bg-primary-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              {p}
            </button>
          )
        )}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || totalPages === 0}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
