import { useEffect, useState } from 'react';
import { gradesApi, reportsApi } from '@/api/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Download } from 'lucide-react';
import type { Grade } from '@/types';

const MONTH_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

interface OwingStudent {
  student_number?: string;
  name: string;
  balance: number;
}

interface MonthlySummaryData {
  total_income: number;
  payment_count: number;
  outstanding_total: number;
  students_owing: number;
  students_owing_list: OwingStudent[];
}

interface OutstandingMonth {
  month: number;
  period: string;
  outstanding_total: number;
  students_owing: number;
}

interface MatrixMonth {
  month: number;
  label: string;
}

interface MatrixStudent {
  student_number: string;
  name: string;
  grade: string;
  balances: Record<string, string>;
}

interface OutstandingMatrix {
  months: MatrixMonth[];
  students: MatrixStudent[];
  totals: Record<string, string>;
}

export default function ReportsPage() {
  const year = new Date().getFullYear();
  const [tab, setTab] = useState<'income' | 'outstanding' | 'payments' | 'export'>('income');

  // Reports are monthly. Outstanding balances can be shown either as the
  // position up to month-end or as only this month's billed/paid balance.
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [balanceMode, setBalanceMode] = useState<'carry' | 'month'>('carry');

  const [summary, setSummary] = useState<MonthlySummaryData>({
    total_income: 0,
    payment_count: 0,
    outstanding_total: 0,
    students_owing: 0,
    students_owing_list: [],
  });
  const [payments, setPayments] = useState<{ total_received: number; by_method: Record<string, number> }>({ total_received: 0, by_method: {} });
  const [outstandingByMonth, setOutstandingByMonth] = useState<OutstandingMonth[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [exportGrade, setExportGrade] = useState('');
  const [exportMonth, setExportMonth] = useState(new Date().getMonth() + 1);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    // Backend returns Decimal values serialized as strings — coerce to numbers
    // so string `+` never concatenates downstream.
    Promise.all([
      reportsApi.monthlySummary(year, month),
      reportsApi.statements(year, 'overdue', undefined, month, balanceMode === 'month'),
      reportsApi.paymentsReceived(year, undefined, undefined, month).then((r) => {
        const by_method: Record<string, number> = {};
        for (const [method, amount] of Object.entries(r.data.by_method)) {
          by_method[method] = Number(amount);
        }
        setPayments({ total_received: Number(r.data.total_received), by_method });
      }),
      reportsApi.outstandingByMonth(year, month).then((r) => {
        setOutstandingByMonth(
          (r.data.months || []).map((m: OutstandingMonth) => ({
            month: m.month,
            period: m.period,
            outstanding_total: Number(m.outstanding_total),
            students_owing: Number(m.students_owing),
          })),
        );
      }),
      gradesApi.list().then((r) => setGrades(r.data)),
    ])
      .then(([monthly, statementReport]) => {
        setSummary({
          total_income: Number(monthly.data.total_income),
          payment_count: Number(monthly.data.payment_count),
          outstanding_total: Number(statementReport.data.total_outstanding),
          students_owing: Number(statementReport.data.total_students),
          students_owing_list: (statementReport.data.students || []).map((s: { student_number?: string; name: string; balance: string | number }) => ({
            student_number: s.student_number,
            name: s.name,
            balance: Number(s.balance),
          })),
        });
      })
      .finally(() => setLoading(false));
  }, [year, month, balanceMode]);

  const tabs = [
    { key: 'income' as const, label: 'Monthly Income' },
    { key: 'outstanding' as const, label: 'Outstanding Fees' },
    { key: 'payments' as const, label: 'Payments by Method' },
    { key: 'export' as const, label: 'Export Students' },
  ];
  const outstandingLabel =
    balanceMode === 'month'
      ? `Outstanding this month only — ${MONTH_FULL[month - 1]} ${year}`
      : `Outstanding with carry-over — ${MONTH_FULL[month - 1]} ${year}`;

  const exportStudentExcel = async (gradeId?: string) => {
    if (exporting) return;
    setExporting(true);
    try {
      const m = exportMonth;
      const resp = await reportsApi.downloadStudentExport(year, gradeId, m);
      const selected = gradeId ? grades.find((g) => g.id === gradeId) : null;
      const blob = new Blob([resp.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const scope = selected ? `-${selected.name.replace(/\s+/g, '')}` : '';
      a.download = `LCS-GERMISTON${scope}-SUSPENSION-LIST-${MONTH_FULL[m - 1]}-${year}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed', err);
      alert('Export failed — please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportCSV = (rows: (string | number)[][], filename: string) => {
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportIncomeCsv = () => {
    const owing = summary.students_owing_list;
    const rows: (string | number)[][] = [
      ['Month', `${MONTH_FULL[month - 1]} ${year}`],
      [],
      ['Income received', summary.total_income],
      ['Payments received', summary.payment_count],
      [outstandingLabel, summary.outstanding_total],
      ['Students owing', summary.students_owing],
      [],
      ...(owing.length ? [['Student Number', 'Student Name', 'Balance (R)'] as (string | number)[], ...owing.map((s) => [s.student_number || '', s.name, s.balance] as (string | number)[])] : []),
    ];
    exportCSV(rows, `monthly-income-${year}-${String(month).padStart(2, '0')}.csv`);
  };

  // The Excel/CSV export shows each student's position for EVERY month, as a
  // student-by-month matrix, rather than one cumulative figure for the year.
  // The selected carry-over / this-month-only mode decides what each month's
  // cell means, and the backend computes every column with the same query the
  // on-screen report uses so the file always matches what is displayed.
  const exportOutstandingCsv = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const resp = await reportsApi.outstandingMatrix(year, balanceMode === 'month');
      const data = resp.data as OutstandingMatrix;
      const months = data.months || [];

      const rows: (string | number)[][] = [
        [`${outstandingLabel} — per student per month`],
        [
          'Student Number',
          'Student Name',
          'Grade',
          ...months.map((m) => `${m.label} (R)`),
        ],
        ...(data.students || []).map((s) => [
          s.student_number || '',
          s.name,
          s.grade || '',
          ...months.map((m) => Number(s.balances?.[String(m.month)] ?? 0)),
        ]),
        [],
        // Per-month column totals replace the old cumulative block.
        ['', '', 'Total', ...months.map((m) => Number(data.totals?.[String(m.month)] ?? 0))],
      ];

      exportCSV(rows, `outstanding-by-month-${year}-${balanceMode}.csv`);
    } catch (err) {
      // Log the message only — an axios error carries err.config, which
      // includes the Authorization header.
      console.error('Outstanding export failed:', err instanceof Error ? err.message : 'unknown error');
      alert('Export failed — please try again.');
    } finally {
      setExporting(false);
    }
  };

  const exportPaymentsCsv = () => {
    if (!Object.keys(payments.by_method).length) return;
    const rows: (string | number)[][] = [
      ['Payment Method', `Amount (R) — ${MONTH_FULL[month - 1]} ${year}`],
      ...Object.entries(payments.by_method).map(([method, amount]) => [method, amount]),
      [],
      ['Total', payments.total_received],
    ];
    exportCSV(rows, `payments-by-method-${year}-${String(month).padStart(2, '0')}.csv`);
  };

  const exportExcel = () => {
    if (tab === 'income') exportIncomeCsv();
    else if (tab === 'outstanding') exportOutstandingCsv();
    else if (tab === 'payments') exportPaymentsCsv();
  };

  const monthSelector = (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-medium text-slate-700">Report month</p>
        <p className="text-xs text-slate-400">
          Income is received in the month. Choose whether outstanding includes carry-over or only this month.
        </p>
      </div>
      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-44">
        {MONTH_FULL.map((name, i) => (
          <option key={name} value={i + 1}>{name} {year}</option>
        ))}
      </select>
      <select value={balanceMode} onChange={(e) => setBalanceMode(e.target.value as 'carry' | 'month')} className="input w-52">
        <option value="carry">Outstanding with carry-over</option>
        <option value="month">Outstanding this month only</option>
      </select>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        {tab !== 'export' && (
          <button
            onClick={exportExcel}
            disabled={loading}
            className="btn btn-secondary"
          >
            <Download className="h-4 w-4" /> Export Excel
          </button>
        )}
      </div>

      <div className="flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === t.key ? 'bg-primary-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== 'export' && monthSelector}

      {tab === 'income' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
              <p className="text-sm text-slate-500">Income received — {MONTH_FULL[month - 1]} {year}</p>
              <p className="mt-2 text-3xl font-bold text-emerald-700">R {summary.total_income.toLocaleString()}</p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
              <p className="text-sm text-slate-500">Payments received — {MONTH_FULL[month - 1]} {year}</p>
              <p className="mt-2 text-3xl font-bold text-slate-900">{summary.payment_count}</p>
            </div>
            <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
              <p className="text-sm text-slate-500">{outstandingLabel}</p>
              <p className="mt-2 text-3xl font-bold text-red-600">R {summary.outstanding_total.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-400">{summary.students_owing} students owing</p>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
            <h2 className="mb-4 text-lg font-semibold">Top {outstandingLabel}</h2>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
              </div>
            ) : summary.students_owing_list.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={summary.students_owing_list.slice(0, 15).map((s) => ({ name: s.student_number ? `${s.student_number} — ${s.name}` : s.name, balance: s.balance }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" interval={0} angle={-35} textAnchor="end" height={100} tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(v: number) => `R ${v.toLocaleString()}`} />
                    <Bar dataKey="balance" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <p className="mt-2 text-xs text-slate-400">Showing the top 15 of {summary.students_owing_list.length} students owing.</p>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No fees outstanding for this view.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'outstanding' && (
        <div className="space-y-6">
          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
            <h2 className="mb-1 text-lg font-semibold">Outstanding by month — cumulative</h2>
            <p className="mb-4 text-sm text-slate-500">
              Total still owed as at the end of each month (January → {MONTH_FULL[month - 1]} {year}).
              The balance grows as fees are billed and shrinks as payments arrive.
            </p>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
              </div>
            ) : outstandingByMonth.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={outstandingByMonth.map((m) => ({ name: MONTH_FULL[m.month - 1], outstanding_total: m.outstanding_total, students_owing: m.students_owing }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                    <YAxis />
                    <Tooltip formatter={(v: number) => `R ${v.toLocaleString()}`} />
                    <Bar dataKey="outstanding_total" fill="#ef4444" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Month</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Outstanding (R)</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Students owing</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {outstandingByMonth.map((m) => (
                        <tr key={m.month} className={m.month === month ? 'bg-red-50/50' : 'hover:bg-slate-50'}>
                          <td className="px-4 py-3 text-sm font-medium text-slate-900">
                            {MONTH_FULL[m.month - 1]} {year}
                            {m.month === month && <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">SELECTED</span>}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-red-600">R {m.outstanding_total.toLocaleString()}</td>
                          <td className="px-4 py-3 text-right text-sm text-slate-700">{m.students_owing}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No outstanding data for this period.</p>
            )}
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{outstandingLabel} ({summary.students_owing} students)</h2>
              {summary.students_owing_list.length > 0 && (
                <span className="text-sm font-medium text-red-600">
                  Total: R {summary.outstanding_total.toLocaleString()}
                </span>
              )}
            </div>
            {loading ? (
              <div className="flex h-64 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
              </div>
            ) : summary.students_owing_list.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student No.</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.students_owing_list.map((s, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-mono text-sm text-slate-500">{s.student_number || '—'}</td>
                        <td className="px-4 py-3 text-sm font-medium text-slate-900">{s.name}</td>
                        <td className="px-4 py-3 text-right text-sm font-medium text-red-600">R {s.balance.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">No fees outstanding for this view.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'payments' && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h2 className="mb-4 text-lg font-semibold">Payments by Method — {MONTH_FULL[month - 1]} {year}: R {payments.total_received.toLocaleString()} total</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={Object.entries(payments.by_method).map(([name, value]) => ({ name, value }))}
                  cx="50%"
                  cy="50%"
                  outerRadius={100}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {Object.keys(payments.by_method).map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => `R ${v.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-3">
              {Object.entries(payments.by_method).map(([method, amount], i) => (
                <div key={method} className="flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                  <span className="flex-1 text-sm text-slate-700">{method}</span>
                  <span className="text-sm font-medium text-slate-900">R {amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'export' && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h2 className="mb-1 text-lg font-semibold">Export Students (.xlsx)</h2>
          <p className="mb-4 text-sm text-slate-500">
            Download the full student list in the school's suspension-list layout
            (Customer | Grade | Amount | Comments | Learners on suspension).
            The Amount column shows each student's outstanding balance for the
            selected month, not the whole year.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={exportMonth}
              onChange={(e) => setExportMonth(Number(e.target.value))}
              className="input w-full sm:w-40"
            >
              {MONTH_FULL.map((name, i) => (
                <option key={name} value={i + 1}>{name}</option>
              ))}
            </select>
            <select
              value={exportGrade}
              onChange={(e) => setExportGrade(e.target.value)}
              className="input w-full sm:w-64"
            >
              <option value="">All grades</option>
              {grades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            <button
              onClick={() => exportStudentExcel(exportGrade || undefined)}
              disabled={exporting}
              className="btn btn-primary"
            >
              {exporting ? 'Generating…' : exportGrade ? 'Export this grade' : 'Export all students'}
            </button>
          </div>
          {exportGrade && (
            <p className="mt-2 text-xs text-slate-400">
              File will be named with the selected grade, e.g. LCS-GERMISTON-GRADE9-SUSPENSION-LIST-SEPTEMBER-{year}.xlsx
            </p>
          )}
        </div>
      )}
    </div>
  );
}
