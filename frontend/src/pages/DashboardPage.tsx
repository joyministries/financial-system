import { useCallback, useEffect, useState } from 'react';
import { gradesApi, reportsApi } from '@/api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, AlertTriangle, Users, TrendingUp, Eye, EyeOff } from 'lucide-react';
import Pagination from '@/components/Pagination';
import type { Grade, MonthlySummaryReport } from '@/types';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT_OWING_PAGE_SIZE = 10;

const selectCls =
  'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20';

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [gradeId, setGradeId] = useState('');
  const [grades, setGrades] = useState<Grade[]>([]);
  const [summary, setSummary] = useState<MonthlySummaryReport | null>(null);
  const [trends, setTrends] = useState<{ month: number; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [owingPage, setOwingPage] = useState(1);
  const [owingPageSize, setOwingPageSize] = useState(DEFAULT_OWING_PAGE_SIZE);
  const [hideAmounts, setHideAmounts] = useState(true);

  useEffect(() => {
    gradesApi.list().then((r) => setGrades(r.data)).catch(() => setGrades([]));
  }, []);

  const loadSummary = useCallback(async (y: number, m: number, g: string) => {
    setLoading(true);
    try {
      const [summaryRes, trendsRes] = await Promise.all([
        reportsApi.monthlySummary(y, m, g || undefined),
        reportsApi.paymentTrends(y),
      ]);
      setSummary(summaryRes.data);
      setTrends(trendsRes.data.trends);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(year, month, gradeId);
  }, [year, month, gradeId, loadSummary]);

  useEffect(() => { setOwingPage(1); }, [year, month, gradeId]);

  const owingTotal = summary?.students_owing_list.length ?? 0;
  const owingTotalPages = Math.max(1, Math.ceil(owingTotal / owingPageSize));
  const owingList = (summary?.students_owing_list ?? []).slice(
    (owingPage - 1) * owingPageSize,
    owingPage * owingPageSize,
  );

  const activeGradeName = grades.find((g) => g.id === gradeId)?.name;

  const stats = [
    {
      label: 'Income Received',
      value: hideAmounts ? '••••••' : (summary ? `R ${summary.total_income.toLocaleString()}` : '—'),
      sub: 'verified payments this month',
      icon: DollarSign,
      gradient: 'from-emerald-500 to-teal-600',
      ring: 'ring-emerald-100',
      sensitive: true,
    },
    {
      label: 'Outstanding',
      value: hideAmounts ? '••••••' : (summary ? `R ${summary.outstanding_total.toLocaleString()}` : '—'),
      sub: 'owed up to this month',
      icon: AlertTriangle,
      gradient: 'from-red-500 to-rose-600',
      ring: 'ring-red-100',
      sensitive: true,
    },
    {
      label: 'Students Owing',
      value: summary ? String(summary.students_owing) : '—',
      sub: 'with an unpaid balance',
      icon: Users,
      gradient: 'from-amber-500 to-orange-600',
      ring: 'ring-amber-100',
      sensitive: false,
    },
    {
      label: 'Payments',
      value: summary ? String(summary.payment_count) : '—',
      sub: 'received this month',
      icon: TrendingUp,
      gradient: 'from-primary-500 to-primary-700',
      ring: 'ring-primary-100',
      sensitive: false,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Financial Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Monthly view — {MONTHS_FULL[month - 1]} {year}
            {activeGradeName ? ` · ${activeGradeName}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={gradeId}
            onChange={(e) => setGradeId(e.target.value)}
            className={selectCls}
            aria-label="Grade"
          >
            <option value="">All Grades</option>
            {grades.filter((g) => g.is_active).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(parseInt(e.target.value))}
            className={selectCls}
            aria-label="Month"
          >
            {MONTHS_FULL.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value))}
            className={selectCls}
            aria-label="Year"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-soft transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${s.gradient} text-white shadow-soft ring-4 ${s.ring}`}
              >
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-xs font-medium text-slate-500">{s.label}</p>
                  {s.sensitive && (
                    <button
                      onClick={() => setHideAmounts((v) => !v)}
                      className="rounded-md p-0.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      title={hideAmounts ? 'Show amounts' : 'Hide amounts'}
                    >
                      {hideAmounts ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                    </button>
                  )}
                </div>
                <p className="mt-0.5 truncate text-lg font-bold tracking-tight text-slate-900">
                  {s.value}
                </p>
                <p className="truncate text-[11px] text-slate-400">{s.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-soft">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="text-base font-semibold tracking-tight text-slate-900">
            Students Owing — {MONTHS_FULL[month - 1]} {year}
          </h2>
          {summary && summary.students_owing > 0 && (
            <span className="badge badge-warning">
              {summary.students_owing} student{summary.students_owing === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : summary && summary.students_owing_list.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Number</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Grade</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {owingList.map((s) => (
                  <tr key={s.student_id} className="transition-colors hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-semibold text-slate-900">{s.name}</td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-500">{s.student_number}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{s.grade}</td>
                    <td className="px-6 py-4 text-right text-sm font-semibold text-red-600">R {s.balance.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
            {owingTotal > 0 && (
              <Pagination
                page={owingPage}
                totalPages={owingTotalPages}
                total={owingTotal}
                pageSize={owingPageSize}
                onPageChange={setOwingPage}
                onPageSizeChange={(s) => { setOwingPageSize(s); setOwingPage(1); }}
              />
            )}
          </>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">No outstanding balances for this month.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-soft">
        <h2 className="mb-4 text-base font-semibold tracking-tight text-slate-900">
          Payment Trends ({year})
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trends.map((t) => ({ name: MONTHS[t.month - 1], total: t.total }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: '#f1f5f9' }}
              formatter={(v: number) => [`R ${v.toLocaleString()}`, 'Income']}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 12px 32px -12px rgba(16,24,40,0.2)' }}
            />
            <Bar dataKey="total" fill="#c9a227" radius={[6, 6, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
