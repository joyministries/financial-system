import { useEffect, useRef, useState } from 'react';
import { studentsApi } from '@/api/client';
import type { Student } from '@/types';
import { Search, X, Loader2 } from 'lucide-react';
import clsx from 'clsx';

interface Props {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Exclude these student ids from results (e.g. already-selected elsewhere). */
  excludeIds?: string[];
}

/**
 * Searchable student picker. Searches the full student list server-side
 * (name / student number) so it works with thousands of students —
 * unlike a plain <select> which only shows the first 50.
 */
export default function StudentSearchSelect({
  value,
  onChange,
  placeholder = 'Search student by name or number…',
  disabled,
  excludeIds = [],
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);

  // Resolve the selected student's name when `value` is set from outside.
  useEffect(() => {
    if (value) {
      studentsApi
        .get(value)
        .then((r) => setSelected(r.data))
        .catch(() => setSelected(null));
    } else {
      setSelected(null);
      setQuery('');
    }
  }, [value]);

  // Debounced server-side search.
  useEffect(() => {
    if (!open) return;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setLoading(true);
      studentsApi
        .list({ search: query.trim() || undefined, limit: 10 })
        .then((r) => setResults(r.data.items.filter((s: Student) => !excludeIds.includes(s.id))))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, open, excludeIds]);

  // Close on outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (s: Student) => {
    setSelected(s);
    setQuery('');
    setOpen(false);
    onChange(s.id);
  };

  const clear = () => {
    setSelected(null);
    setQuery('');
    setOpen(false);
    onChange('');
  };

  return (
    <div ref={rootRef} className="relative min-w-56">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-muted" />
        <input
          value={selected ? `${selected.first_name} ${selected.last_name} (${selected.student_number})` : query}
          onChange={(e) => {
            setSelected(null);
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (!selected) setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && results[0]) {
              e.preventDefault();
              pick(results[0]);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className="input pl-9 pr-9"
        />
        {(selected || query) && !disabled && (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-ledger-muted hover:text-ledger-ink"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {open && !selected && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-ledger-border bg-ledger-surface py-1">
          {loading ? (
            <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-ledger-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ledger-muted">No students found.</p>
          ) : (
            results.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(s)}
                className={clsx(
                  'flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-ledger-row-hover'
                )}
              >
                <span className="truncate font-medium text-ledger-ink">
                  {s.first_name} {s.last_name}
                </span>
                <span className="shrink-0 font-mono text-xs text-ledger-muted">{s.student_number}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
