import { useCallback, useEffect, useState } from 'react';
import { gradesApi, reportsApi } from '@/api/client';
import { Download } from 'lucide-react';
import type { Grade } from '@/types';

const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

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

interface PaymentsBreakdown {
  total_received: number;
  by_method: Record<string, number>;
}

const money = (n: number) => `R ${Number(n).toLocaleString()}`;

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
  const [payments, setPayments] = useState<PaymentsBreakdown>({ total_received: 0, by_method: {} });
  const [outstandingByMonth, setOutstandingByMonth] = useState<OutstandingMonth[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [exportGrade, setExportGrade] = useState('');
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [monthly, statementReport, paymentsRes, outstandingRes, gradesRes] = await Promise.all([
        reportsApi.monthlySummary(year, month),
        reportsApi.statements(year, 'overdue', undefined, month, balanceMode === 'month'),
        reportsApi.paymentsReceived(year, undefined, undefined, month),
        reportsApi.outstandingByMonth(year, month),
        gradesApi.list(),
      ]);

      const by_method: Record<string, number> = {};
      for (const [method, amount] of Object.entries(paymentsRes.data.by_method)) {
        by_method[method] = Number(amount);
      }

      setPayments({ total_received: Number(paymentsRes.data.total_received), by_method });
      setGrades(gradesRes.data);
      setOutstandingByMonth(
        (outstandingRes.data.months || []).map((m: OutstandingMonth) => ({
          month: m.month,
          period: m.period,
          outstanding_total: Number(m.outstanding_total),
          students_owing: Number(m.students_owing),
        }))
      );
      setSummary({
        total_income: Number(monthly.data.total_income),
        payment_count: Number(monthly.data.payment_count),
        outstanding_total: Number(statementReport.data.total_outstanding),
        students_owing: Number(statementReport.data.total_students),
        students_owing_list: (statementReport.data.students || []).map(
          (s: { student_number?: string; name: string; balance: string | number }) => ({
            student_number: s.student_number,
            name: s.name,
            balance: Number(s.balance),
          })
        ),
      });
    } finally {
      setLoading(false);
    }
  }, [year, month, balanceMode]);

  useEffect(() => {
    load();
  }, [load, reloadToken]);

  // A receipt entered in another tab must not leave this report showing the
  // balance from before it. Refresh whenever the window regains focus.
  useEffect(() => {
    const onFocus = () => setReloadToken((t) => t + 1);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const tabs = [
    { key: 'income' as const, label: 'Monthly Income' },
    { key: 'outstanding' as const, label: 'Outstanding Fees' },
    { key: 'payments' as const, label: 'Payments by Method' },
    { key: 'export' as const, label: 'Export Students' },
  ];

  // ── Exports ────────────────────────────────────────────────
  // Every export re-reads the API at click time. Clicking "Export Excel"
  // straight after recording a receipt must reflect that receipt, never the
  // page's cached state.
  const exportStudentExcel = async (gradeId?: string) => {
    if (exporting) return;
    setExporting(true);
    try {
      const resp = await reportsApi.downloadStudentExport(year, gradeId, month);
      const selected = gradeId ? grades.find((g) => g.id === gradeId) : null;
      const blob = new Blob([resp.data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const scope = selected ? `-${selected.name.replace(/\s+/g, '')}` : '';
      a.download = `LCS-GERMISTON${scope}-SUSPENSION-LIST-${MONTH_FULL[month - 1]}-${year}.xlsx`;
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
    const csv = rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportIncomeCsv = async () => {
    const [monthly, statementReport] = await Promise.all([
      reportsApi.monthlySummary(year, month),
      reportsApi.statements(year, 'overdue', undefined, month, balanceMode === 'month'),
    ]);
    const owing = (statementReport.data.students || []).map(
      (s: { student_number?: string; name: string; balance: string | number }) => ({
        student_number: s.student_number,
        name: s.name,
        balance: Number(s.balance),
      })
    );
    const rows: (string | number)[][] = [
      ['Month', `${MONTH_FULL[month - 1]} ${year}`],
      [],
      ['Income received', Number(monthly.data.total_income)],
      ['Payments received', Number(monthly.data.payment_count)],
      [],
      ...(owing.length
        ? [
            ['Student Number', 'Student Name', 'Balance (R)'] as (string | number)[],
            ...owing.map((s: OwingStudent) => [s.student_number || '', s.name, s.balance] as (string | number)[]),
          ]
        : []),
    ];
    exportCSV(rows, `monthly-income-${year}-${String(month).padStart(2, '0')}.csv`);
  };

  // The Excel/CSV export shows each student's position for EVERY month up to
  // the report month, as a student-by-month matrix — the same months the
  // on-screen "Outstanding by month" table lists.
  const exportOutstandingCsv = async () => {
    const resp = await reportsApi.outstandingMatrix(year, balanceMode === 'month', undefined, month);
    const data = resp.data as OutstandingMatrix;
    const months = data.months || [];

    const rows: (string | number)[][] = [
      [`Outstanding per student per month — up to ${MONTH_FULL[month - 1]} ${year}`],
      ['Student Number', 'Student Name', 'Grade', ...months.map((m) => `${m.label} (R)`)],
      ...(data.students || []).map((s) => [
        s.student_number || '',
        s.name,
        s.grade || '',
        ...months.map((m) => Number(s.balances?.[String(m.month)] ?? 0)),
      ]),
      [],
      ['', '', 'Total', ...months.map((m) => Number(data.totals?.[String(m.month)] ?? 0))],
    ];

    exportCSV(rows, `outstanding-by-month-${year}-${balanceMode}.csv`);
  };

  const exportPaymentsCsv = async () => {
    const resp = await reportsApi.paymentsReceived(year, undefined, undefined, month);
    const entries = Object.entries(resp.data.by_method);
    const rows: (string | number)[][] = [
      ['Payment Method', `Amount (R) — ${MONTH_FULL[month - 1]} ${year}`],
      ...entries.map(([method, amount]) => [method, Number(amount)]),
      [],
      ['Total', Number(resp.data.total_received)],
    ];
    exportCSV(rows, `payments-by-method-${year}-${String(month).padStart(2, '0')}.csv`);
  };

  const exportExcel = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      if (tab === 'income') await exportIncomeCsv();
      else if (tab === 'outstanding') await exportOutstandingCsv();
      else if (tab === 'payments') await exportPaymentsCsv();
    } catch (err) {
      console.error('Export failed:', err instanceof Error ? err.message : 'unknown error');
      alert('Export failed — please try again.');
    } finally {
      setExporting(false);
    }
  };

  const showSpinner = loading && summary.students_owing_list.length === 0 && outstandingByMonth.length === 0;

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div>
          <p className="eyebrow">Financial reports · {year}</p>
          <h1 className="page-title mt-1">Reports</h1>
          <p className="page-subtitle">
            Every figure is read live. Exports re-query at click time.
          </p>
        </div>
        {tab !== 'export' && (
          <button onClick={exportExcel} disabled={exporting} className="btn btn-secondary">
            <Download className="h-4 w-4" /> {exporting ? 'Exporting…' : 'Export Excel'}
          </button>
        )}
      </div>

      <div className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
              tab === t.key ? 'bg-primary-900 text-white' : 'text-body hover:bg-[#fdfbf5] hover:text-ink'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card flex flex-wrap items-center gap-3 p-4">
        <div className="mr-auto">
          <p className="card-title">Report month</p>
          <p className="mt-0.5 text-[11.5px] text-muted">
            Income is booked in the month received. Outstanding can include carry-over or this month only.
          </p>
        </div>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="input w-44">
          {MONTH_FULL.map((name, i) => (
            <option key={name} value={i + 1}>{name} {year}</option>
          ))}
        </select>
        <select
          value={balanceMode}
          onChange={(e) => setBalanceMode(e.target.value as 'carry' | 'month')}
          className="input w-56"
        >
          <option value="carry">Outstanding with carry-over</option>
          <option value="month">Amount due for month</option>
        </select>
      </div>

      {tab === 'income' && (
        <div className="space-y-5">
          <section className="card grid grid-cols-1 sm:grid-cols-2">
            {[
              {
                label: 'Income received',
                value: money(summary.total_income),
                tone: 'text-[#1c7a4f]',
                meta: `${MONTH_FULL[month - 1]} ${year}`,
              },
              {
                label: 'Payments received',
                value: String(summary.payment_count),
                tone: 'text-ink',
                meta: `${MONTH_FULL[month - 1]} ${year}`,
              },
            ].map((f, i) => (
              <div key={f.label} className={`px-5 py-4 ${i > 0 ? 'border-t border-line-soft sm:border-l sm:border-t-0' : ''}`}>
                <p className="stat-label">{f.label}</p>
                <p className={`mt-3 text-[26px] font-bold leading-none tracking-[-0.03em] tabular-nums ${f.tone}`}>
                  {showSpinner ? '—' : f.value}
                </p>
                {f.meta && <p className="mt-1.5 text-[11.5px] text-muted">{f.meta}</p>}
              </div>
            ))}
          </section>

          <section className="table-wrap">
            <div className="card-head">
              <div>
                <p className="eyebrow">Accounts in arrears</p>
                <h2 className="card-title mt-1">Students owing — {MONTH_FULL[month - 1]} {year}</h2>
              </div>
              <span className="ml-auto badge badge-warning">{summary.students_owing}</span>
            </div>
            {showSpinner ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent-500" />
              </div>
            ) : summary.students_owing_list.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted">No fees outstanding for this view.</p>
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="th">Student no.</th>
                      <th className="th">Student</th>
                      <th className="th text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.students_owing_list.map((s, i) => (
                      <tr key={`${s.student_number}-${i}`} className="row-hover">
                        <td className="td font-mono text-[12px] text-muted">{s.student_number || '—'}</td>
                        <td className="td font-semibold text-ink">{s.name}</td>
                        <td className="td text-right font-semibold tabular-nums text-[#a8382c]">{money(s.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'outstanding' && (
        <div className="space-y-5">
          <section className="table-wrap">
            <div className="card-head">
              <div>
                <p className="eyebrow">Cumulative position</p>
                <h2 className="card-title mt-1">Outstanding by month — January to {MONTH_FULL[month - 1]} {year}</h2>
              </div>
            </div>
            {showSpinner ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent-500" />
              </div>
            ) : outstandingByMonth.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted">No outstanding data for this period.</p>
            ) : (
              <table className="min-w-full">
                <thead>
                  <tr>
                    <th className="th">Month</th>
                    <th className="th text-right">Outstanding</th>
                    <th className="th text-right">Students owing</th>
                  </tr>
                </thead>
                <tbody>
                  {outstandingByMonth.map((m) => (
                    <tr key={m.month} className={m.month === month ? 'bg-[#fdfbf5]' : 'row-hover'}>
                      <td className="td font-semibold text-ink">
                        {MONTH_FULL[m.month - 1]} {year}
                        {m.month === month && (
                          <span className="ml-2 rounded-[3px] bg-[#f7eccd] px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[#8a6f13]">
                            Selected
                          </span>
                        )}
                      </td>
                      <td className="td text-right font-semibold tabular-nums text-[#a8382c]">{money(m.outstanding_total)}</td>
                      <td className="td text-right tabular-nums text-body">{m.students_owing}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="table-wrap">
            <div className="card-head">
              <div>
                <p className="eyebrow">{balanceMode === 'month' ? 'This month only' : 'With carry-over'}</p>
                <h2 className="card-title mt-1">Students owing — {MONTH_FULL[month - 1]} {year}</h2>
              </div>
              <span className="ml-auto badge badge-warning">{summary.students_owing}</span>
            </div>
            {showSpinner ? (
              <div className="flex h-32 items-center justify-center">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-line border-t-accent-500" />
              </div>
            ) : summary.students_owing_list.length === 0 ? (
              <p className="py-10 text-center text-[13px] text-muted">No fees outstanding for this view.</p>
            ) : (
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-full">
                  <thead className="sticky top-0 z-10">
                    <tr>
                      <th className="th">Student no.</th>
                      <th className="th">Student</th>
                      <th className="th text-right">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.students_owing_list.map((s, i) => (
                      <tr key={`${s.student_number}-${i}`} className="row-hover">
                        <td className="td font-mono text-[12px] text-muted">{s.student_number || '—'}</td>
                        <td className="td font-semibold text-ink">{s.name}</td>
                        <td className="td text-right font-semibold tabular-nums text-[#a8382c]">{money(s.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {tab === 'payments' && (
        <section className="table-wrap">
          <div className="card-head">
            <div>
              <p className="eyebrow">Collections</p>
              <h2 className="card-title mt-1">Payments by method — {MONTH_FULL[month - 1]} {year}</h2>
            </div>
            <span className="ml-auto text-[12.5px] font-semibold tabular-nums text-ink">
              {money(payments.total_received)}
            </span>
          </div>
          {Object.keys(payments.by_method).length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">No payments received this month.</p>
          ) : (
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className="th">Method</th>
                  <th className="th text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(payments.by_method)
                  .sort(([, a], [, b]) => b - a)
                  .map(([method, amount]) => (
                    <tr key={method} className="row-hover">
                      <td className="td font-semibold text-ink">{method}</td>
                      <td className="td text-right font-semibold tabular-nums text-ink">{money(amount)}</td>
                    </tr>
                  ))}
              </tbody>
              <tfoot>
                <tr className="bg-[#fdfcf9]">
                  <td className="td font-semibold text-ink">Total</td>
                  <td className="td text-right font-bold tabular-nums text-ink">{money(payments.total_received)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </section>
      )}

      {tab === 'export' && (
        <section className="card p-5 sm:p-6">
          <p className="eyebrow">Download</p>
          <h2 className="card-title mt-1 text-[15px]">Export students (.xlsx)</h2>
          <p className="mt-1 max-w-2xl text-[12.5px] leading-relaxed text-muted">
            The school's suspension-list layout (Customer | Grade | Amount | Comments | Learners on
            suspension). The Amount column is each student's{' '}
            <span className="font-semibold text-ink">current amount due</span> as at{' '}
            <span className="font-semibold text-ink">{MONTH_FULL[month - 1]} {year}</span> — the
            month's fee plus the balance carried forward, straight from their generated statement.
          </p>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
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
          <p className="mt-3 flex items-center gap-2 text-[11.5px] text-faint">
            <Download className="h-3.5 w-3.5" />
            File: LCS-GERMISTON{exportGrade ? `-${grades.find((g) => g.id === exportGrade)?.name.replace(/\s+/g, '') ?? ''}` : ''}-SUSPENSION-LIST-{MONTH_FULL[month - 1].toUpperCase()}-{year}.xlsx
          </p>
        </section>
      )}
    </div>
  );
}
