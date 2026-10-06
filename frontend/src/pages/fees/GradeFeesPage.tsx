import { useCallback, useEffect, useState } from 'react';
import { feesApi, gradesApi } from '@/api/client';
import type { FeeStructure, Grade } from '@/types';
import toast from 'react-hot-toast';
import { Loader2, Pencil, Check, X } from 'lucide-react';

/** Format a rands figure the way every other money cell in the app does. */
const rands = (v: number) => `R ${v.toLocaleString()}`;

/** Annual amount implied by a monthly tuition figure (12 instalments). */
const annualFrom = (monthly: number) => Math.round(monthly * 12 * 100) / 100;

/**
 * Grade Fees — the school's tuition tariff in one place.
 *
 * `/fees` edits one grade at a time across every fee category. This screen
 * exists for the other question a finance officer actually asks: "what does
 * each grade cost this year, and can I change them all from here?" So it is a
 * ledger, not a dashboard — one row per grade, monthly tuition editable in
 * place, the annual figure derived from it.
 */
export default function GradeFeesPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [feeMap, setFeeMap] = useState<Record<string, FeeStructure | null>>({});
  const [year, setYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (y: number) => {
    setLoading(true);
    try {
      const g = await gradesApi.list();
      setGrades(g.data);
      const entries = await Promise.all(
        g.data.map(async (grade) => {
          try {
            const res = await feesApi.listByGrade(grade.id, y);
            // The tariff is the Tuition row; other categories belong on /fees.
            const tuition = res.data.find((f) => f.category === 'Tuition') ?? null;
            return [grade.id, tuition] as const;
          } catch {
            return [grade.id, null] as const;
          }
        }),
      );
      setFeeMap(Object.fromEntries(entries));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(year);
  }, [year, load]);

  const startEdit = (gradeId: string) => {
    const fee = feeMap[gradeId];
    setEditingId(gradeId);
    setDraft(fee ? String(fee.monthly_installment ?? fee.annual_amount) : '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft('');
  };

  const save = async (gradeId: string) => {
    const monthly = parseFloat(draft);
    if (!Number.isFinite(monthly) || monthly <= 0) {
      return toast.error('Monthly fee must be greater than 0');
    }
    const annual = annualFrom(monthly);
    const existing = feeMap[gradeId];
    setSaving(true);
    try {
      if (existing) {
        await feesApi.update(existing.id, {
          annual_amount: annual,
          monthly_installment: monthly,
        });
        toast.success('Grade fee updated');
      } else {
        await feesApi.create(gradeId, {
          academic_year: year,
          category: 'Tuition',
          annual_amount: annual,
          payment_plan: 'monthly',
          monthly_installment: monthly,
        });
        toast.success('Grade fee added');
      }
      cancelEdit();
      await load(year);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save grade fee');
    } finally {
      setSaving(false);
    }
  };

  const setCount = grades.filter((g) => feeMap[g.id]).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Grade Fees</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monthly tuition for every grade, side by side. The annual figure is
            calculated as 12 monthly instalments.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          Academic year
          <input
            type="number"
            value={year}
            min={2000}
            max={2100}
            onChange={(e) => {
              const next = parseInt(e.target.value, 10);
              if (Number.isFinite(next)) setYear(next);
            }}
            className="w-28 input"
          />
        </label>
      </div>

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-x-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Grade</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Monthly tuition</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Annual</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {grades.map((grade) => {
                  const fee = feeMap[grade.id] ?? null;
                  const editing = editingId === grade.id;
                  const monthly = fee?.monthly_installment ?? null;
                  const annual = fee ? Number(fee.annual_amount) : null;
                  const draftMonthly = parseFloat(draft);
                  const preview = editing && Number.isFinite(draftMonthly) && draftMonthly > 0
                    ? { monthly: draftMonthly, annual: annualFrom(draftMonthly) }
                    : null;

                  return (
                    <tr key={grade.id} className={editing ? 'bg-blue-50/40' : 'hover:bg-slate-50'}>
                      <td className="px-6 py-4 text-sm font-medium text-slate-900 whitespace-nowrap">
                        {grade.name}
                      </td>

                      <td className="px-6 py-4 text-right text-sm tabular-nums">
                        {editing ? (
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') save(grade.id);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            className="w-36 rounded-lg border border-blue-300 px-3 py-1.5 text-right text-sm focus:border-blue-500 focus:outline-none"
                            aria-label={`${grade.name} monthly tuition`}
                          />
                        ) : preview ? (
                          <span className="text-blue-700">{rands(preview.monthly)}</span>
                        ) : monthly ? (
                          <span className="font-medium text-slate-900">{rands(Number(monthly))}</span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right text-sm text-slate-600 tabular-nums">
                        {editing && preview
                          ? rands(preview.annual)
                          : annual
                            ? rands(annual)
                            : <span className="text-slate-400">—</span>}
                      </td>

                      <td className="px-6 py-4">
                        {fee ? (
                          <span className="inline-flex rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-700">
                            Set for {year}
                          </span>
                        ) : (
                          <span className="inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                            Not set
                          </span>
                        )}
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editing ? (
                            <>
                              <button
                                onClick={() => save(grade.id)}
                                disabled={saving}
                                className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                <Check className="mr-1 inline h-3 w-3" />
                                {saving ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                onClick={cancelEdit}
                                disabled={saving}
                                className="rounded-lg bg-white px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50 disabled:opacity-50"
                              >
                                <X className="mr-1 inline h-3 w-3" />
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => startEdit(grade.id)}
                              className="rounded-lg bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                            >
                              <Pencil className="mr-1 inline h-3 w-3" />
                              {fee ? 'Edit' : 'Set fee'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {grades.length === 0 && (
              <p className="py-8 text-center text-sm text-slate-500">
                No grades yet. Add a grade first, then set its fee here.
              </p>
            )}
          </>
        )}
      </div>

      {grades.length > 0 && (
        <p className="text-xs text-slate-500">
          {setCount} of {grades.length} grades have a tuition fee set for {year}.
          {' '}Changes here apply to every student in the grade.
        </p>
      )}
    </div>
  );
}
