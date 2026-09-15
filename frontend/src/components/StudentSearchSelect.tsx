import { useEffect, useRef, useState } from 'react';
import { studentsApi } from '@/api/client';
import type { Student } from '@/types';
import { Search, X, Loader2, ChevronDown } from 'lucide-react';
import clsx from 'clsx';

const NO_EXCLUDES: string[] = [];

interface Props {
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Exclude these student ids from results (e.g. already-selected elsewhere). */
  excludeIds?: string[];
}

/**
 * Searchable student picker.
 *
 * UX rules:
 * - Dropdown only opens when the user types ≥2 characters. Focusing the field
 *   alone does NOT open it.
 * - While a student is selected the input is read-only; clicking the clear (×)
 *   button clears the selection and focuses the input for a new search.
 * - Minimum 2 characters before the API is called so single-char / empty-string
 *   fetches never fire.
 * - 350 ms debounce to avoid hammering the API on fast typing.
 */
export default function StudentSearchSelect({
  value,
  onChange,
  placeholder = 'Type a name or student number…',
  disabled,
  excludeIds = NO_EXCLUDES,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Student[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Student | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | undefined>(undefined);
  const latestQueryRef = useRef('');
  // excludeIds lives in a ref so a new array identity per render can never
  // retrigger the search effect (the parent re-renders constantly).
  const excludeIdsRef = useRef(excludeIds);
  useEffect(() => {
    excludeIdsRef.current = excludeIds;
  }, [excludeIds]);

  // Resolve the selected student's name when `value` is set externally.
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

  // Debounced server-side search — fires only when open AND query ≥2 chars,
  // and only when the query itself changes (never on parent re-renders, which
  // used to retrigger via the excludeIds prop identity). Prior results stay on
  // screen while a refresh is in flight so the list never "blinks" away
  // mid-click; a latency guard drops out-of-order responses.
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    const q = query.trim();
    latestQueryRef.current = q;
    window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      setLoading(true);
      studentsApi
        .list({ search: q, limit: 10 })
        .then((r) => {
          if (latestQueryRef.current !== q) return; // stale response — ignore
          setResults(r.data.items.filter((s: Student) => !excludeIdsRef.current.includes(s.id)));
        })
        .catch(() => {
          if (latestQueryRef.current !== q) return;
          setResults([]);
        })
        .finally(() => {
          if (latestQueryRef.current === q) setLoading(false);
        });
    }, 450);
    return () => window.clearTimeout(debounceRef.current);
  }, [query, open]);

  // Close on outside click.
  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const pick = (s: Student) => {
    setSelected(s);
    setQuery('');
    setOpen(false);
    setResults([]);
    onChange(s.id);
  };

  const clear = () => {
    setSelected(null);
    setQuery('');
    setOpen(false);
    setResults([]);
    onChange('');
    // Focus input so user can type immediately, but don't open the dropdown.
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const displayValue = selected
    ? `${selected.first_name} ${selected.last_name} (${selected.student_number})`
    : query;

  return (
    <div ref={rootRef} className="relative min-w-56">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

        <input
          ref={inputRef}
          value={displayValue}
          readOnly={!!selected}
          onChange={(e) => {
            // Only runs when nothing is selected (input is not readOnly).
            const val = e.target.value;
            setQuery(val);
            // Only open dropdown when query is ≥2 chars.
            setOpen(val.trim().length >= 2);
          }}
          onFocus={() => {
            // Don't open if something is already selected (input is read-only).
            if (selected) return;
            // Don't open on bare focus — only when there's a real query.
            // (The onChange handler above handles opening when typing.)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            }
            if (e.key === 'Enter' && results[0]) {
              e.preventDefault();
              pick(results[0]);
            }
            // If user starts typing while something is selected, clear the
            // selection but do NOT open the dropdown yet — let them type ≥2
            // chars first (the onChange handler will open it).
            if (selected && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
              e.preventDefault();
              setSelected(null);
              setQuery(e.key);
              setOpen(false);
              // Don't set onChange('') yet — we'll do that when they actually
              // pick a new student or explicitly clear. This avoids flickering.
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          className={clsx(
            'input pl-9 pr-9',
            selected && 'cursor-default bg-slate-50 text-slate-700'
          )}
          aria-haspopup="listbox"
          aria-expanded={open}
          autoComplete="off"
        />

        {/* Right side: clear button when selected, chevron when empty */}
        {selected && !disabled ? (
          <button
            type="button"
            onClick={clear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-rose-500"
            aria-label="Clear selection"
          >
            <X className="h-4 w-4" />
          </button>
        ) : query && !disabled ? (
          <button
            type="button"
            onClick={() => { setQuery(''); setOpen(false); setResults([]); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-rose-500"
            aria-label="Clear"
          >
            <X className="h-4 w-4" />
          </button>
        ) : (
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg"
        >
          {query.trim().length < 2 ? (
            <p className="px-4 py-3 text-sm text-slate-400">Type at least 2 characters to search…</p>
          ) : results.length === 0 ? (
            loading ? (
              <div className="flex items-center justify-center gap-2 px-4 py-3 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching…
              </div>
            ) : (
              <p className="px-4 py-3 text-sm text-slate-500">No students found for "{query}".</p>
            )
          ) : (
            <>
              {/* Results stay clickable while a refresh is in flight */}
              {loading && (
                <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-1.5 text-xs text-slate-400">
                  <Loader2 className="h-3 w-3 animate-spin" /> Refreshing…
                </div>
              )}
              {results.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="option"
                  onClick={() => pick(s)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-primary-50 focus:bg-primary-50 focus:outline-none"
                >
                  <span className="truncate font-medium text-slate-800">
                    {s.first_name} {s.last_name}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-slate-400">{s.student_number}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
