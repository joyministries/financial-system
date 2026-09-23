import { useEffect, useState } from 'react';
import { financialApi, reportsApi, studentsApi, gradesApi, chargesApi, paymentsApi, downloadPdf } from '@/api/client';
import { getStudentNames } from '@/lib/studentNames';
import type { Student, Statement, Grade, AdditionalCharge, Payment } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Download, FilePlus2, Landmark, Loader2 } from 'lucide-react';
import Pagination from '@/components/Pagination';
import StudentSearchSelect from '@/components/StudentSearchSelect';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT_PAGE_SIZE = 50;

const downloadErrorMessage = async (err: any) => {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const parsed = JSON.parse(text);
      return parsed.detail || 'Download failed';
    } catch {
      return 'Download failed';
    }
  }
  return data?.detail || 'Download failed';
};

interface SchoolStatement {
  student_id: string;
  student_number: string;
  name: string;
  grade: string;
  balance: string;
  status: string;
}
interface SchoolStatementReport {
  academic_year: number;
  month?: number | null;
  total_students: number;
  total_outstanding: string;
  students: SchoolStatement[];
}

export default function StatementsPage() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [statements, setStatements] = useState<Statement[]>([]);
  const [selectedStatement, setSelectedStatement] = useState<Statement | null>(null);
  const [stmtMonth, setStmtMonth] = useState<number | ''>('');
  const [genMonth, setGenMonth] = useState<number | ''>(1);
  const [generatingMonth, setGeneratingMonth] = useState<number | null>(null); // per-row state
  const [loading, setLoading] = useState(false);
  const [namesLoading, setNamesLoading] = useState(true);

  // Transaction ledger for the selected bank-style statement.
  const [ledgerCharges, setLedgerCharges] = useState<AdditionalCharge[]>([]);
  const [ledgerPayments, setLedgerPayments] = useState<Payment[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [statementMonths, setStatementMonths] = useState<number>(0); // 0=year to date, 3/6/12=range

  // Whole-school statement summary (admin / finance only).
  const [schoolStatus, setSchoolStatus] = useState<'all' | 'paid' | 'overdue'>('all');
  const [schoolBalanceMode, setSchoolBalanceMode] = useState<'carry' | 'month'>('carry');
  const [schoolReport, setSchoolReport] = useState<SchoolStatementReport | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(false);
  const [bulkMonth, setBulkMonth] = useState<number | ''>(1);
  const [bulkGrade, setBulkGrade] = useState<string>('');
  const [bulking, setBulking] = useState(false);
  const [nameMap, setNameMap] = useState<Map<string, { name: string; student_number: string }>>(new Map());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const pagedSchoolStudents = (schoolReport?.students ?? []).slice((page - 1) * pageSize, page * pageSize);
  const schoolReportMonthLabel = bulkMonth ? MONTHS[(bulkMonth as number) - 1] : 'Full year';

  useEffect(() => {
    // Parents only ever see their own children (the backend enforces this too).
    studentsApi.list(isParent ? { parent_id: user!.id } : {}).then((r) => {
      setStudents(r.data.items);
      // Auto-select the first child so a parent sees statements immediately.
      if (isParent && r.data.items.length > 0) setSelectedStudent(r.data.items[0].id);
    });
    gradesApi.list().then((r) => setGrades(r.data));
    getStudentNames().then(setNameMap).finally(() => setNamesLoading(false));
  }, []);

  const loadStatements = () => {
    if (!selectedStudent) return;
    setLoading(true);
    financialApi.listStatements(selectedStudent, year).then((r) => setStatements(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { loadStatements(); }, [selectedStudent, year]);

  // Load the transaction detail behind a statement so it can be rendered as a
  // bank-style ledger (charges + verified payments for the statement month).
  useEffect(() => {
    if (!selectedStatement) { setLedgerCharges([]); setLedgerPayments([]); return; }
    const sid = selectedStatement.student_id;
    const y = selectedStatement.academic_year;
    const m = selectedStatement.month;
    setLoadingLedger(true);
    Promise.all([
      chargesApi.list(sid, y).then((r) => r.data as AdditionalCharge[]).catch(() => [] as AdditionalCharge[]),
      paymentsApi.list({ student_id: sid, limit: 200 }).then((r) => r.data.items as Payment[]).catch(() => [] as Payment[]),
    ])
      .then(([charges, payments]) => {
        setLedgerCharges(charges.filter((c) => c.academic_year === y && c.month === m));
        setLedgerPayments(
          payments.filter(
            (p) => p.status === 'verified' && p.payment_date?.startsWith(`${y}-${String(m).padStart(2, '0')}`)
          )
        );
      })
      .finally(() => setLoadingLedger(false));
  }, [selectedStatement]);

  /**
   * Merged generate-then-download for each row.
   * If the statement already exists it skips generation and downloads immediately.
   * Per-row spinner via generatingMonth state.
   */
  const generateAndDownload = async (existing: Statement | null, month: number, monthsOverride?: number) => {
    if (!selectedStudent) return toast.error('Select a student');
    const months = monthsOverride ?? statementMonths;
    setGeneratingMonth(month);
    const toastId = toast.loading(existing && !('_pending' in existing) ? 'Preparing download…' : 'Generating statement…');
    try {
      let stmt: Statement | null = existing && !('_pending' in existing) ? existing : null;
      if (!stmt) {
        const res = await financialApi.generateStatement({ student_id: selectedStudent, academic_year: year, month });
        stmt = res.data as Statement;
        loadStatements();
        if (selectedStatement?.month === month) setSelectedStatement(stmt);
        toast.loading('Download ready — starting…', { id: toastId });
      }
      const studentName = getStudentName(selectedStudent).replace(/\s+/g, '-');
      if (!stmt) throw new Error('Statement not available');
      const rangeTag = months === 12 ? '-full-year' : months > 1 ? `-${months}m` : '';
      await downloadPdf(
        financialApi.statementDownloadUrl(stmt.student_id, stmt.academic_year, stmt.month, months),
        `statement-${studentName}-${stmt.academic_year}-${String(stmt.month).padStart(2, '0')}${rangeTag}.pdf`,
      );
      toast.success('Download started', { id: toastId });
    } catch (err: any) {
      const detail = err?.response?.data?.detail || 'Failed — try again';
      toast.error(detail, { id: toastId });
    } finally {
      setGeneratingMonth(null);
    }
  };

  const getStudentName = (id: string) => {
    const entry = nameMap.get(id);
    if (entry) return entry.name;
    const s = students.find((s) => s.id === id);
    return s ? `${s.first_name} ${s.last_name}` : 'Student unavailable';
  };

  const loadSchoolReport = () => {
    if (isParent) return;
    setLoadingSchool(true);
    setPage(1);
    reportsApi
      .statements(
        year,
        schoolStatus === 'all' ? undefined : schoolStatus,
        selectedGrade || undefined,
        bulkMonth || undefined,
        schoolBalanceMode === 'month',
      )
      .then((r) => setSchoolReport(r.data))
      .catch(() => toast.error('Could not load the school statement summary'))
      .finally(() => setLoadingSchool(false));
  };

  useEffect(() => { loadSchoolReport(); }, [year, schoolStatus, selectedGrade, bulkMonth, schoolBalanceMode]);

  const downloadSchoolStatements = async () => {
    if (!bulkMonth) return toast.error('Select a month first');
    const toastId = toast.loading('Preparing whole-school statement bundle…');
    try {
      await downloadPdf(
        financialApi.schoolSummaryDownloadUrl(year, bulkMonth as number),
        `school-statements-${year}-${bulkMonth}.pdf`,
      );
      toast.success('Download started', { id: toastId });
    } catch (err: any) {
      toast.error(await downloadErrorMessage(err), { id: toastId });
    }
  };

  // Grade statement bundle: January → selected month, one PDF containing each
  // approved student's full bank-style statement.
  const downloadGradeCumulative = async () => {
    if (!bulkGrade) return toast.error('Select a grade first');
    if (!bulkMonth) return toast.error('Select a month first');
    const toastId = toast.loading('Preparing grade statement bundle…');
    try {
      const grade = grades.find((g) => g.id === bulkGrade);
      const gradeName = grade ? grade.name.replace(/\s+/g, '-') : bulkGrade;
      await downloadPdf(
        financialApi.gradeCumulativeDownloadUrl(bulkGrade, year, bulkMonth as number),
        `grade-statements-${gradeName}-${year}-${bulkMonth}.pdf`,
      );
      toast.success('Download started', { id: toastId });
    } catch (err: any) {
      toast.error(await downloadErrorMessage(err), { id: toastId });
    }
  };

  const handleBulkGenerate = async () => {
    if (!bulkMonth) return toast.error('Select a month');
    setBulking(true);
    try {
      const res = await financialApi.generateAllStatements(year, bulkMonth as number, bulkGrade || undefined);
      toast.success(`${bulkGrade ? 'Grade' : 'Whole school'}: ${res.data.generated} generated (months 1–${bulkMonth}), ${res.data.skipped} already existed`);
      loadSchoolReport();
      // Generate is now generate-AND-download: once the statements exist,
      // pull the full statement bundle so the admin gets the file in one click.
      await (bulkGrade ? downloadGradeCumulative() : downloadSchoolStatements());
    } catch {
      toast.error('Bulk generation failed');
    } finally {
      setBulking(false);
    }
  };

  const exportCsv = () => {
    if (!schoolReport) return;
    const rows = [
      ['Student Number', 'Student', 'Grade', 'Balance (R)', 'Status'],
      ...schoolReport.students.map((s) => [s.student_number, s.name, s.grade, s.balance, s.status]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `school-statements-${year}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // downloadStatement is kept for the bank-view header button (already-generated statements)
  const downloadStatement = async (s: Statement) => {
    await generateAndDownload(s, s.month);
  };

  // One-click whole cumulative statement: January to the current month of the
  // selected year, combined in a single PDF. No month knowledge required —
  // this is the "statement till now" download.
  const downloadFullYearStatement = async () => {
    if (!selectedStudent) return toast.error('Select a student first');
    const endMonth = year === new Date().getFullYear() ? Math.min(12, new Date().getMonth() + 1) : 12;
    const existing = visibleStatements.find((s) => s.month === endMonth) ?? null;
    await generateAndDownload(existing, endMonth, 12);
  };

  const downloadSelectedStudentStatement = async () => {
    if (!selectedStudent) return toast.error('Select a student first');
    if (!bulkMonth) return toast.error('Select a month first');
    const existing = statements.find((s) => s.month === bulkMonth) ?? null;
    await generateAndDownload(existing, bulkMonth as number, 12);
  };

  const visibleStatements = (() => {
    // Show every month of the school year (1-12), not just the ones that have
    // been generated. Missing months get a synthetic row flagged _pending so
    // the user can Generate & Download them — no more 'only Jan and Feb'.
    const byMonth = new Map(statements.map((s) => [s.month, s]));
    const targetYearEnd = year === new Date().getFullYear() ? Math.min(12, new Date().getMonth() + 1) : 12;
    const range = stmtMonth ? [stmtMonth] : Array.from({ length: targetYearEnd }, (_, i) => i + 1);
    return range
      .map((m): (Statement & { _pending?: boolean }) => {
        const existing = byMonth.get(m);
        if (existing) return existing;
        return {
          id: `pending-${year}-${m}`,
          student_id: selectedStudent || '',
          academic_year: year,
          month: m,
          opening_balance: 0,
          total_fees: 0,
          total_installments: 0,
          total_additional_charges: 0,
          total_payments: 0,
          closing_balance: 0,
          current_amount_due: 0,
          due_date: '',
          generated_at: '',
          _pending: true,
        } satisfies Statement & { _pending?: boolean };
      })
      .sort((a, b) => a.month - b.month);
  })();

  // ── Bank-style ledger ─────────────────────────────────────
  // Rows: opening balance → installment (debit) → charges (debit) →
  // payments (credit) → closing balance. Running balance column like a bank
  // statement so parents see exactly how the month's number was reached.
  interface LedgerRow { date: string; description: string; debit?: number; credit?: number; balance: number; bold?: boolean }
  const buildLedger = (s: Statement): LedgerRow[] => {
    const rows: LedgerRow[] = [];
    let balance = s.opening_balance;
    const dueDate = s.due_date ? new Date(s.due_date).toLocaleDateString() : `${MONTHS[s.month - 1]} ${s.academic_year}`;
    rows.push({
      date: dueDate,
      description: 'Balance brought forward',
      balance,
      bold: true,
    });
    if (s.total_installments > 0) {
      balance += s.total_installments;
      rows.push({
        date: dueDate,
        description: `Monthly installment — ${MONTHS[s.month - 1]} ${s.academic_year}`,
        debit: s.total_installments,
        balance,
      });
    }
    ledgerCharges.forEach((c) => {
      balance += c.amount;
      rows.push({
        date: c.created_at ? new Date(c.created_at).toLocaleDateString() : dueDate,
        description: `${c.description}${c.charge_type ? ` (${c.charge_type})` : ''}`,
        debit: c.amount,
        balance,
      });
    });
    ledgerPayments.forEach((p) => {
      balance -= p.amount;
      const ref = (p.reference_number || '').trim();
      let description: string;
      if (ref.toUpperCase().startsWith('CRN')) {
        description = `Credit note — ${ref}`;
      } else if (!ref) {
        description = 'Balance brought forward';
      } else {
        description = `Payment — ${p.payment_method}${ref ? ` (${ref})` : ''}`;
      }
      rows.push({
        date: new Date(p.payment_date).toLocaleDateString(),
        description,
        credit: p.amount,
        balance,
      });
    });
    if (Math.abs(balance - s.closing_balance) > 0.01) {
      // Safety net: reconcile to the stored closing balance if the live
      // transaction list is incomplete.
      balance = s.closing_balance;
    }
    rows.push({
      date: dueDate,
      description: 'Balance carried forward',
      balance,
      bold: true,
    });
    return rows;
  };

  const monthlyAmountDue = (s: Statement) =>
    s.total_installments + s.total_additional_charges - s.total_payments;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">{isParent ? 'My Statements' : 'Student Statements'}</h1>

      <div className="flex flex-wrap items-center gap-4">
        {!isParent && (
          <select value={selectedGrade} onChange={(e) => { setSelectedGrade(e.target.value); setSelectedStudent(''); }} className="input w-44">
            <option value="">All Grades</option>
            {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <StudentSearchSelect
          value={selectedStudent}
          onChange={setSelectedStudent}
          placeholder={isParent ? 'Search my children…' : 'Search student…'}
        />
        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="input w-28" />
        <select value={stmtMonth} onChange={(e) => setStmtMonth(e.target.value ? parseInt(e.target.value) : '')} className="input w-44">
          <option value="">All months</option>
          {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
        </select>
        <select value={genMonth} onChange={(e) => setGenMonth(parseInt(e.target.value))} className="input w-44">
          <option value="">Select month…</option>
          {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
        </select>
        <button
          onClick={() => generateAndDownload(
            visibleStatements.find(s => s.month === genMonth) ?? null,
            genMonth as number
          )}
          disabled={generatingMonth !== null || !genMonth || !selectedStudent}
          className="btn btn-primary"
        >
          {generatingMonth !== null && generatingMonth === genMonth
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : <><Download className="h-4 w-4" /> Generate & Download</>
          }
        </button>
        <button
          onClick={downloadFullYearStatement}
          disabled={generatingMonth !== null || !selectedStudent}
          className="btn btn-secondary"
          title="Downloads the whole cumulative statement for this student — January to the current month — in one PDF"
        >
          {generatingMonth !== null
            ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</>
            : <><Download className="h-4 w-4" /> Download Full Year Statement</>
          }
        </button>
      </div>

      {isParent && (
        <p className="text-sm text-slate-500">
          Generate a statement for any month of the current school year. Statements you generate are only for your own children. Use <span className="font-medium">Download Full Year Statement</span> to pull everything from January to the current month in one PDF.
        </p>
      )}

      {selectedStatement && (
        <div className="overflow-x-auto rounded-xl bg-white shadow-sm border border-slate-200">
          {/* Bank-style statement header */}
          <div className="bg-[#131d3c] px-6 py-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10">
                    <Landmark className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <p className="text-lg font-bold tracking-wide text-white">Lambton Christian School</p>
                    <p className="text-xs uppercase tracking-widest text-slate-300">Statement of Account</p>
                  </div>
                </div>
              </div>
              <button onClick={() => downloadStatement(selectedStatement)} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white hover:bg-white/20">
                <Download className="h-4 w-4" /> Download PDF
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 border-t border-white/10 pt-4 text-sm sm:grid-cols-4">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Account Holder</p>
                <p className="mt-0.5 font-semibold text-white">{getStudentName(selectedStatement.student_id)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Account Number</p>
                <p className="mt-0.5 font-mono font-semibold text-white">
                  {students.find((s) => s.id === selectedStatement.student_id)?.student_number || '—'}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Statement Period</p>
                <p className="mt-0.5 font-semibold text-white">{MONTHS[selectedStatement.month - 1]} {selectedStatement.academic_year}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Download Range</p>
                <select
                  value={statementMonths}
                  onChange={(e) => setStatementMonths(Number(e.target.value))}
                  className="mt-0.5 rounded border border-slate-600 bg-[#1e2a4a] px-2 py-1 text-xs font-semibold text-white focus:border-primary-500 focus:outline-none"
                >
                  <option value={0}>Year to date</option>
                  <option value={3}>3 months</option>
                  <option value={6}>6 months</option>
                  <option value={12}>Full year</option>
                </select>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-slate-400">Date Issued</p>
                <p className="mt-0.5 font-semibold text-white">{new Date(selectedStatement.generated_at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
              </div>
            </div>
          </div>

          {/* Balance summary strip */}
          <div className="grid grid-cols-1 divide-y divide-slate-200 sm:grid-cols-5 sm:divide-x sm:divide-y-0">
            <div className="bg-slate-50 px-6 py-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Opening Balance</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900">R {selectedStatement.opening_balance.toLocaleString()}</p>
            </div>
            <div className="bg-slate-50 px-6 py-4">
              <p className="text-[11px] uppercase tracking-wider text-slate-500">Total Charged</p>
              <p className="mt-1 font-mono text-lg font-bold text-slate-900">R {(selectedStatement.total_installments + selectedStatement.total_additional_charges).toLocaleString()}</p>
            </div>
            <div className="bg-emerald-50 px-6 py-4">
              <p className="text-[11px] uppercase tracking-wider text-emerald-700">Total Paid</p>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-700">R {selectedStatement.total_payments.toLocaleString()}</p>
            </div>
            <div className={`px-6 py-4 ${monthlyAmountDue(selectedStatement) > 0 ? 'bg-[#131d3c]' : 'bg-emerald-600'}`}>
              <p className={`text-[11px] uppercase tracking-wider ${monthlyAmountDue(selectedStatement) > 0 ? 'text-slate-300' : 'text-white'}`}>Amount Due This Month</p>
              <p className="mt-1 font-mono text-lg font-bold text-white">R {monthlyAmountDue(selectedStatement).toLocaleString()}</p>
            </div>
            <div className={`px-6 py-4 ${selectedStatement.current_amount_due > 0 ? 'bg-rose-50' : 'bg-emerald-50'}`}>
              <p className={`text-[11px] uppercase tracking-wider ${selectedStatement.current_amount_due > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>Outstanding Year</p>
              <p className={`mt-1 font-mono text-lg font-bold ${selectedStatement.current_amount_due > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>R {selectedStatement.current_amount_due.toLocaleString()}</p>
            </div>
          </div>

          {loadingLedger ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto px-2 py-2">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-slate-500">
                    <th className="border-b border-slate-300 px-4 py-3 text-left font-medium">Date</th>
                    <th className="border-b border-slate-300 px-4 py-3 text-left font-medium">Transaction Details</th>
                    <th className="border-b border-slate-300 px-4 py-3 text-right font-medium">Debit</th>
                    <th className="border-b border-slate-300 px-4 py-3 text-right font-medium">Credit</th>
                    <th className="border-b border-slate-300 px-4 py-3 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {buildLedger(selectedStatement).map((row, i) => {
                    const isClosing = i === buildLedger(selectedStatement).length - 1;
                    return (
                      <tr key={i} className={`text-[13px] ${isClosing ? 'border-t-2 border-slate-400 font-bold' : row.bold ? 'font-semibold' : 'text-slate-700'}`}>
                        <td className={`px-4 py-2.5 ${row.bold ? 'text-slate-800' : 'text-slate-600'}`}>{row.date}</td>
                        <td className={`px-4 py-2.5 ${row.bold ? 'text-slate-900' : 'text-slate-800'}`}>{row.description}</td>
                        <td className="px-4 py-2.5 text-right text-rose-700">{row.debit ? `R ${row.debit.toLocaleString()}` : ''}</td>
                        <td className="px-4 py-2.5 text-right text-emerald-700">{row.credit ? `R ${row.credit.toLocaleString()}` : ''}</td>
                        <td className="px-4 py-2.5 text-right text-slate-900">{`R ${row.balance.toLocaleString()}`}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Statement footer */}
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                <span className="text-slate-500">Total annual fees: <span className="font-semibold text-slate-800">R {selectedStatement.total_fees.toLocaleString()}</span></span>
                <span className="text-slate-500">Payments this month: <span className="font-semibold text-emerald-700">R {selectedStatement.total_payments.toLocaleString()}</span></span>
                <span className="text-slate-500">Due date: <span className="font-semibold text-slate-800">{new Date(selectedStatement.due_date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' })}</span></span>
              </div>
              <p className="text-xs text-slate-400">Thank you for banking with Lambton Christian School</p>
            </div>
            {selectedStatement.total_payments > 0 && (
              <div className="mt-3 rounded-lg bg-emerald-50 border border-emerald-200 px-4 py-2 text-sm text-emerald-700">
                <span className="font-medium">Payment received:</span> R {selectedStatement.total_payments.toLocaleString()} has been credited to this account for {MONTHS[selectedStatement.month - 1]}.
              </div>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-x-auto">
        {loading || namesLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <>
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Month</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Installment</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Payments</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Generated</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleStatements.map((s) => (
              <tr key={s.id} className={`cursor-pointer hover:bg-slate-50 ${'_pending' in s ? 'text-slate-400' : ''}`} onClick={() => !('_pending' in s) && setSelectedStatement(s)}>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{MONTHS[s.month - 1]}</td>
                <td className="px-6 py-4 text-sm text-slate-700">{'_pending' in s ? '—' : `R ${s.total_installments.toLocaleString()}`}</td>
                <td className="px-6 py-4 text-sm text-emerald-600 font-medium">{'_pending' in s ? '—' : `R ${s.total_payments.toLocaleString()}`}</td>
                <td className={`px-6 py-4 text-sm font-medium ${'_pending' in s ? '' : (s.closing_balance > 0 ? 'text-red-600' : 'text-emerald-600')}`}>{'_pending' in s ? '—' : `R ${s.closing_balance.toLocaleString()}`}</td>
                <td className="px-6 py-4">
                  {'_pending' in s ? (
                    <span className="badge badge-neutral">Not generated</span>
                  ) : (
                    <span className={`badge ${s.closing_balance > 0 ? 'badge-danger' : 'badge-success'}`}>
                      {s.closing_balance > 0 ? 'Outstanding' : 'Paid'}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-slate-500">{'_pending' in s ? '—' : new Date(s.generated_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() => generateAndDownload(s, s.month)}
                    disabled={generatingMonth === s.month}
                    className="btn btn-secondary btn-sm"
                  >
                    {generatingMonth === s.month
                      ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</>
                      : <><Download className="h-3.5 w-3.5" /> {'_pending' in s ? 'Generate & Download' : 'Download'}</>
                    }
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleStatements.length === 0 && !loading && <p className="py-8 text-center text-sm text-slate-500">{selectedStudent ? 'No statements for this student yet.' : 'Select a student.'}</p>}
          </>
        )}
      </div>

      {!isParent && (
        <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-x-auto">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Whole School — Statement Summary ({schoolReportMonthLabel} {year})</h2>
              <p className="text-sm text-slate-500">
                {schoolBalanceMode === 'month'
                  ? "Every approved student's outstanding for this month only."
                  : "Every approved student's outstanding balance up to the selected month."}
                {schoolReport && schoolReport.total_students > 0 && (
                  <span> Total outstanding: <span className="font-medium text-red-600">R {Number(schoolReport.total_outstanding).toLocaleString()}</span></span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select value={schoolStatus} onChange={(e) => setSchoolStatus(e.target.value as 'all' | 'paid' | 'overdue')} className="input w-40">
                <option value="all">All statuses</option>
                <option value="overdue">Overdue</option>
                <option value="paid">Paid</option>
              </select>
              <select value={schoolBalanceMode} onChange={(e) => setSchoolBalanceMode(e.target.value as 'carry' | 'month')} className="input w-48">
                <option value="carry">With carry-over</option>
                <option value="month">This month only</option>
              </select>
              <button onClick={exportCsv} className="btn btn-secondary" disabled={!schoolReport || schoolReport.students.length === 0}>
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-500">Generate statements:</span>
              <select value={bulkGrade} onChange={(e) => setBulkGrade(e.target.value)} className="input w-48">
                <option value="">All grades (whole school)</option>
                {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <select value={bulkMonth} onChange={(e) => setBulkMonth(parseInt(e.target.value))} className="input w-44">
                <option value="">Select month…</option>
                {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
              <button onClick={handleBulkGenerate} disabled={bulking || !bulkMonth} className="btn btn-primary">
                <FilePlus2 className="h-4 w-4" /> {bulking ? 'Generating…' : 'Generate & Download'}
              </button>
              <button onClick={downloadSchoolStatements} disabled={!bulkMonth} className="btn btn-secondary">
                <Download className="h-4 w-4" /> Whole School Statement Bundle
              </button>
              <button
                onClick={downloadSelectedStudentStatement}
                disabled={!selectedStudent || !bulkMonth || generatingMonth !== null}
                className="btn btn-secondary"
                title="Downloads the selected student's year-to-date statement up to the selected month"
              >
                <Download className="h-4 w-4" /> Student Statement
              </button>
              <button
                onClick={downloadGradeCumulative}
                disabled={!bulkGrade || !bulkMonth}
                className="btn btn-secondary"
                title="Downloads one PDF with every approved student's full year-to-date statement for this grade"
              >
                <Download className="h-4 w-4" /> {bulkGrade ? 'Grade Statement Bundle' : 'Select a grade…'}
              </button>
            </div>
          </div>

          {loadingSchool ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student No.</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Grade</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Balance</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedSchoolStudents.map((s) => (
                    <tr key={s.student_id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-mono text-sm text-slate-500">{s.student_number}</td>
                      <td className="px-6 py-3 text-sm font-medium text-slate-900">{s.name}</td>
                      <td className="px-6 py-3 text-sm text-slate-700">{s.grade}</td>
                      <td className={`px-6 py-3 text-right text-sm font-medium ${Number(s.balance) > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        R {Number(s.balance).toLocaleString()}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <span className={`badge ${s.status === 'overdue' ? 'badge-danger' : 'badge-success'}`}>
                          {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(!schoolReport || schoolReport.students.length === 0) && (
                <p className="py-8 text-center text-sm text-slate-500">No students found for this year.</p>
              )}
              {schoolReport && schoolReport.students.length > 0 && (
                <div className="border-t border-slate-100">
                  <Pagination
                    page={page}
                    totalPages={Math.max(1, Math.ceil(schoolReport.students.length / pageSize))}
                    total={schoolReport.students.length}
                    pageSize={pageSize}
                    onPageChange={setPage}
                    onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
