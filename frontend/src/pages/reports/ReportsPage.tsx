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

export default function ReportsPage() {
  const year = new Date().getFullYear();
  const [tab, setTab] = useState<'income' | 'outstanding' | 'payments' | 'export'>('income');

  // Reports are MONTHLY — every tab reports on the selected month ("as at"
  // balances use the outstanding position up to that month).
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  const [summary, setSummary] = useState<MonthlySummaryData>({
    total_income: 0,
    payment_count: 0,
    outstanding_total: 0,
    students_owing: 0,
    students_owing_list: [],
  });
  const [payments, setPayments] = useState<{ total_received: number; by_method: Record<string, number> }>({ total_received: 0, by_method: {} });
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
      reportsApi.monthlySummary(year, month).then((r) =>
        setSummary({
          total_income: Number(r.data.total_income),
          payment_count: Number(r.data.payment_count),
          outstanding_total: Number(r.data.outstanding_total),
          students_owing: Number(r.data.students_owing),
          students_owing_list: (r.data.students_owing_list || []).map((s: { student_number?: string; name: string; balance: string | number }) => ({
            student_number: s.student_number,
            name: s.name,
            balance: Number(s.balance),
          })),
        })
      ),
      reportsApi.paymentsReceived(year, undefined, undefined, month).then((r) => {
        const by_method: Record<string, number> = {};
        for (const [method, amount] of Object.entries(r.data.by_method)) {
          by_method[method] = Number(amount);
        }
        setPayments({ total_received: Number(r.data.total_received), by_method });
      }),
      gradesApi.list().then((r) => setGrades(r.data)),
    ]).finally(() => setLoading(false));
  }, [year, month]);

  const tabs = [
    { key: 'income' as const, label: 'Monthly Income' },
    { key: 'outstanding' as const, label: 'Outstanding Fees' },
    { key: 'payments' as const, label: 'Payments by Method' },
    { key: 'export' as const, label: 'Export Students' },
  ];

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
      ['Outstanding total', summary.outstanding_total],
      ['Students owing', summary.students_owing],
      [],
      ...(owing.length ? [['Student Number', 'Student Name', 'Balance (R)'] as (string | number)[], ...owing.map((s) => [s.student_number || '', s.name, s.balance] as (string | number)[])] : []),
    ];
    exportCSV(rows, `monthly-income-${year}-${String(month).padStart(2, '0')}.csv`);
  };

  const exportOutstandingCsv = () => {
    const owing = summary.students_owing_list;
    if (!owing.length) return;
    const rows: (string | number)[][] = [
      ['Student Number', 'Student Name', 'Outstanding (R)'],
      ...owing.map((s) => [s.student_number || '', s.name, s.balance]),
      [],
      ['', `Total Outstanding (${MONTH_FULL[month - 1]} ${year})`, summary.outstanding_total],
    ];
    exportCSV(rows, `outstanding-fees-${year}-${String(month).padStart(2, '0')}.csv`);
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
        <p className="text-xs text-slate-400">Income is what was received in the month; balances are the position up to month-end.</p>
      </div>
      <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-44">
        {MONTH_FULL.map((name, i) => (
          <option key={name} value={i + 1}>{name} {year}</option>
        ))}
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
              <p className="text-sm text-slate-500">Outstanding as at {MONTH_FULL[month - 1]} {year}</p>
              <p className="mt-2 text-3xl font-bold text-red-600">R {summary.outstanding_total.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-400">{summary.students_owing} students owing</p>
            </div>
          </div>

          <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
            <h2 className="mb-4 text-lg font-semibold">Top Outstanding — {MONTH_FULL[month - 1]} {year}</h2>
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
              <p className="py-8 text-center text-sm text-slate-500">No outstanding fees as at {MONTH_FULL[month - 1]} {year}.</p>
            )}
          </div>
        </div>
      )}

      {tab === 'outstanding' && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Outstanding Fees as at {MONTH_FULL[month - 1]} {year} ({summary.students_owing} students)</h2>
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
            <p className="py-8 text-center text-sm text-slate-500">No outstanding fees as at {MONTH_FULL[month - 1]} {year}.</p>
          )}
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