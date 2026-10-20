import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { gradesApi, reportsApi } from '@/api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, Eye, EyeOff, Send, Wallet, FileText } from 'lucide-react';
import Pagination from '@/components/Pagination';
import type { Grade, MonthlySummaryReport } from '@/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DEFAULT_OWING_PAGE_SIZE = 10;

const selectCls =
  'h-9 rounded-lg border border-line bg-white px-2.5 text-[12.5px] text-body transition focus:border-accent-500 focus:outline-none focus:ring-2 focus:ring-accent-500/20';

const rand = (n: number) => `R ${Number(n).toLocaleString()}`;

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
      setTrends(trendsRes.data.months);
    } catch {
      setSummary(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(year, month, gradeId);
  }, [year, month, gradeId, loadSummary]);

  useEffect(() => {
    setOwingPage(1);
  }, [year, month, gradeId]);

  const owingTotal = summary?.students_owing_list.length ?? 0;
  const owingTotalPages = Math.max(1, Math.ceil(owingTotal / owingPageSize));
  const owingList = (summary?.students_owing_list ?? []).slice(
    (owingPage - 1) * owingPageSize,
    owingPage * owingPageSize
  );

  const largest = [...(summary?.students_owing_list ?? [])]
    .sort((a, b) => Number(b.balance) - Number(a.balance))
    .slice(0, 5);
  const maxBalance = Number(largest[0]?.balance ?? 0) || 1;

  const activeGradeName = grades.find((g) => g.id === gradeId)?.name;
  const money = (n: number) => (hideAmounts ? '••••••' : rand(n));

  const figures = [
    {
      label: 'Income received',
      value: summary ? money(Number(summary.total_income)) : '—',
      meta: summary ? `${summary.payment_count} payment${summary.payment_count === 1 ? '' : 's'}` : 'this month',
      accent: true,
    },
    {
      label: 'Outstanding',
      value: summary ? money(Number(summary.outstanding_total)) : '—',
      meta: 'owed to date',
      danger: true,
    },
    {
      label: 'Students owing',
      value: summary ? String(summary.students_owing) : '—',
      meta: 'with an unpaid balance',
    },
    {
      label: 'Average payment',
      value:
        summary && summary.payment_count > 0 ? money(Number(summary.total_income) / summary.payment_count) : '—',
      meta: 'per transaction',
    },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="page-header">
        <div>
          <p className="eyebrow">
            {MONTHS_FULL[month - 1]} {year}
            {activeGradeName ? ` · ${activeGradeName}` : ' · All grades'}
          </p>
          <h1 className="page-title mt-1">Dashboard</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} className={selectCls} aria-label="Grade">
            <option value="">All grades</option>
            {grades.filter((g) => g.is_active).map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
          <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className={selectCls} aria-label="Month">
            {MONTHS_FULL.map((m, i) => (
              <option key={i} value={i + 1}>{m}</option>
            ))}
          </select>
          <select value={year} onChange={(e) => setYear(parseInt(e.target.value))} className={selectCls} aria-label="Year">
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button
            onClick={() => setHideAmounts((v) => !v)}
            className="btn btn-secondary"
            title={hideAmounts ? 'Show amounts' : 'Hide amounts'}
          >
            {hideAmounts ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            <span className="hidden sm:inline">{hideAmounts ? 'Show amounts' : 'Hide amounts'}</span>
          </button>
        </div>
      </div>

      {/* ── Ledger strip ───────────────────────────────────── */}
      <section className="card grid grid-cols-2 lg:grid-cols-4">
        {figures.map((f, i) => (
          <div
            key={f.label}
            className={`relative px-4 py-4 sm:px-5 sm:py-5 ${
              i % 2 === 1 ? 'border-l border-line-soft' : ''
            } ${i > 1 ? 'border-t border-line-soft lg:border-t-0' : ''} ${
              i > 0 ? 'lg:border-l lg:border-line-soft' : ''
            }`}
          >
            {f.accent && <span className="absolute left-4 top-0 hidden h-[2px] w-8 bg-accent-500 sm:left-5 lg:block" />}
            <p className="stat-label">{f.label}</p>
            <p className={`stat-value mt-3 ${f.danger && !hideAmounts ? 'text-[#a8382c]' : 'text-ink'}`}>
              {f.value}
            </p>
            <p className="stat-meta">
              {f.danger && <span className="h-1 w-1 rounded-full bg-[#a8382c]" />}
              {f.meta}
            </p>
          </div>
        ))}
      </section>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* ── Owing ledger ─────────────────────────────────── */}
        <section className="table-wrap">
          <div className="card-head">
            <div>
              <p className="eyebrow">Accounts in arrears</p>
              <h2 className="card-title mt-1">Students owing</h2>
            </div>
            {summary && summary.students_owing > 0 && (
              <span className="badge badge-warning ml-auto">
                {summary.students_owing} student{summary.students_owing === 1 ? '' : 's'}
              </span>
            )}
          </div>

          {loading ? (
            <div className="flex h-40 items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent-500" />
            </div>
          ) : summary && summary.students_owing_list.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead>
                    <tr>
                      <th className="th">Student</th>
                      <th className="th">Reg. no.</th>
                      <th className="th hidden sm:table-cell">Grade</th>
                      <th className="th hidden md:table-cell">Share</th>
                      <th className="th text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {owingList.map((s) => {
                      const pct = Math.max(3, Math.round((Number(s.balance) / maxBalance) * 100));
                      return (
                        <tr key={s.student_id} className="row-hover">
                          <td className="td font-semibold text-ink">{s.name}</td>
                          <td className="td font-mono text-[12px] text-muted">{s.student_number}</td>
                          <td className="td hidden text-muted sm:table-cell">{s.grade}</td>
                          <td className="td hidden md:table-cell">
                            <span className="block h-[3px] w-24 bg-line-soft">
                              <span className="block h-full bg-accent-500" style={{ width: `${pct}%` }} />
                            </span>
                          </td>
                          <td className="td text-right font-semibold tabular-nums text-[#a8382c]">
                            {hideAmounts ? '••••' : rand(Number(s.balance))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination
                page={owingPage}
                totalPages={owingTotalPages}
                total={owingTotal}
                pageSize={owingPageSize}
                onPageChange={setOwingPage}
                onPageSizeChange={(s) => {
                  setOwingPageSize(s);
                  setOwingPage(1);
                }}
              />
            </>
          ) : (
            <p className="py-12 text-center text-[13px] text-muted">
              No outstanding balances for this month.
            </p>
          )}
        </section>

        {/* ── Rail ─────────────────────────────────────────── */}
        <aside className="space-y-5">
          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Largest balances</h2>
              <span className="eyebrow ml-auto">Top 5</span>
            </div>
            <div className="divide-y divide-line-soft">
              {largest.length === 0 && (
                <p className="px-4 py-8 text-center text-[12.5px] text-muted">Nothing outstanding.</p>
              )}
              {largest.map((s) => {
                const pct = Math.max(4, Math.round((Number(s.balance) / maxBalance) * 100));
                return (
                  <div key={s.student_id} className="px-4 py-3">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-[12.5px] font-semibold text-ink">{s.name}</p>
                      <p className="shrink-0 font-mono text-[11.5px] font-semibold tabular-nums text-ink">
                        {hideAmounts ? '••••' : rand(Number(s.balance))}
                      </p>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="text-[10.5px] text-faint">{s.grade}</span>
                      <span className="ml-auto block h-[2px] w-20 bg-line-soft">
                        <span className="block h-full bg-primary-800" style={{ width: `${pct}%` }} />
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <h2 className="card-title">Quick actions</h2>
            </div>
            <div className="p-2">
              {[
                { to: '/payments', label: 'Record a payment', icon: Wallet },
                { to: '/statements', label: 'Open statements', icon: FileText },
                { to: '/send-notification', label: 'Message parents', icon: Send },
              ].map((a) => (
                <Link
                  key={a.to}
                  to={a.to}
                  className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-body transition-colors hover:bg-[#fdfbf5] hover:text-ink"
                >
                  <a.icon className="h-4 w-4 text-muted group-hover:text-accent-600" />
                  {a.label}
                  <ArrowUpRight className="ml-auto h-3.5 w-3.5 text-line group-hover:text-accent-600" />
                </Link>
              ))}
            </div>
          </section>
        </aside>
      </div>

      {/* ── Trends ─────────────────────────────────────────── */}
      <section className="card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Cash in</p>
            <h2 className="card-title mt-1">Payment trends · {year}</h2>
          </div>
          <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            ZAR
          </span>
        </div>
        <div className="px-2 pb-4 pt-4 sm:px-4">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trends.map((t) => ({ name: MONTHS[t.month - 1], total: t.total }))} barCategoryGap="34%">
              <CartesianGrid stroke="#f0ece3" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10.5, fill: '#6d7280', fontFamily: 'IBM Plex Mono' }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />
              <YAxis
                tick={{ fontSize: 10.5, fill: '#6d7280', fontFamily: 'IBM Plex Mono' }}
                axisLine={false}
                tickLine={false}
                width={54}
                tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
              />
              <Tooltip
                cursor={{ fill: '#fdfbf5' }}
                formatter={(v: number) => [rand(v), 'Income']}
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e7e3da',
                  fontSize: 12,
                  boxShadow: '0 12px 28px -16px rgba(21,21,23,0.25)',
                }}
              />
              <Bar dataKey="total" fill="#0f1b2b" radius={[2, 2, 0, 0]} maxBarSize={44} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}
