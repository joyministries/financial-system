import { useCallback, useEffect, useState } from 'react';
import { gradesApi, reportsApi } from '@/api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, AlertTriangle, Users, TrendingUp } from 'lucide-react';
import Pagination from '@/components/Pagination';
import type { Grade, MonthlySummaryReport } from '@/types';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT_OWING_PAGE_SIZE = 20;

const selectCls = 'input';

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
      value: summary ? `R ${summary.total_income.toLocaleString()}` : '—',
      sub: 'verified payments this month',
      icon: DollarSign,
    },
    {
      label: 'Outstanding',
      value: summary ? `R ${summary.outstanding_total.toLocaleString()}` : '—',
      sub: 'owed up to this month',
      icon: AlertTriangle,
    },
    {
      label: 'Students Owing',
      value: summary ? String(summary.students_owing) : '—',
      sub: 'with an unpaid balance',
      icon: Users,
    },
    {
      label: 'Payments',
      value: summary ? String(summary.payment_count) : '—',
      sub: 'received this month',
      icon: TrendingUp,
    },
  ];

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Financial Dashboard</h1>
          <p className="mt-1 text-sm text-ledger-muted">
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
            className="card p-5"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg border border-ledger-border bg-ledger-bg text-ledger-muted">
                <s.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ledger-muted">{s.label}</p>
                <p className="mt-0.5 truncate font-display text-2xl font-semibold text-ledger-ink">
                  {s.value}
                </p>
                <p className="truncate text-xs text-ledger-muted">{s.sub}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h2 className="section-title">
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
            <div className="w-full"><div className="skeleton-row" /><div className="skeleton-row" /><div className="skeleton-row" /></div>
          </div>
        ) : summary && summary.students_owing_list.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="ledger-table">
              <thead className="bg-ledger-bg">
                <tr>
                  <th className="th">Student</th>
                  <th className="th">Number</th>
                  <th className="th">Grade</th>
                  <th className="th th-num">Outstanding</th>
                </tr>
              </thead>
              <tbody className="">
                {owingList.map((s) => (
                  <tr key={s.student_id} className="transition-colors hover:bg-ledger-row-hover">
                    <td className="td font-semibold">{s.name}</td>
                    <td className="td font-mono td-muted">{s.student_number}</td>
                    <td className="td td-muted">{s.grade}</td>
                    <td className="td text-right text-sm font-semibold text-ledger-muted">R {s.balance.toLocaleString()}</td>
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
          <p className="py-10 text-center text-sm text-ledger-muted">No outstanding balances for this month.</p>
        )}
      </div>

      <div className="card p-6">
        <h2 className="mb-4 section-title">
          Payment Trends ({year})
        </h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={trends.map((t) => ({ name: MONTHS[t.month - 1], total: t.total }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E0" vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: '#FAFAF9' }}
              formatter={(v: number) => [`R ${v.toLocaleString()}`, 'Income']}
              contentStyle={{ borderRadius: 8, border: '1px solid #E7E5E0', boxShadow: 'none' }}
            />
            <Bar dataKey="total" fill="#2451B0" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
