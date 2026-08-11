import { useEffect, useState } from 'react';
import { financialApi, reportsApi, studentsApi, gradesApi, chargesApi, paymentsApi, downloadPdf } from '@/api/client';
import { getStudentNames } from '@/lib/studentNames';
import type { Student, Statement, Grade, AdditionalCharge, Payment } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Download, FilePlus2 } from 'lucide-react';
import Pagination from '@/components/Pagination';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PAGE_SIZE = 50;

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
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(false);

  // Transaction ledger for the selected bank-style statement.
  const [ledgerCharges, setLedgerCharges] = useState<AdditionalCharge[]>([]);
  const [ledgerPayments, setLedgerPayments] = useState<Payment[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);

  // Whole-school statement summary (admin / finance only).
  const [schoolStatus, setSchoolStatus] = useState<'all' | 'paid' | 'overdue'>('all');
  const [schoolReport, setSchoolReport] = useState<SchoolStatementReport | null>(null);
  const [loadingSchool, setLoadingSchool] = useState(false);
  const [bulkMonth, setBulkMonth] = useState<number | ''>(1);
  const [bulking, setBulking] = useState(false);
  const [nameMap, setNameMap] = useState<Map<string, { name: string; student_number: string }>>(new Map());
  const [page, setPage] = useState(1);

  const pagedSchoolStudents = (schoolReport?.students ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    // Parents only ever see their own children (the backend enforces this too).
    studentsApi.list(isParent ? { parent_id: user!.id } : {}).then((r) => {
      setStudents(r.data);
      // Auto-select the first child so a parent sees statements immediately.
      if (isParent && r.data.length > 0) setSelectedStudent(r.data[0].id);
    });
    gradesApi.list().then((r) => setGrades(r.data));
    getStudentNames().then(setNameMap);
  }, []);

  const filteredStudents = selectedGrade
    ? students.filter((s) => s.grade_id === selectedGrade)
    : students;

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
      paymentsApi.list({ student_id: sid, limit: 200 }).then((r) => r.data as Payment[]).catch(() => [] as Payment[]),
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

  const handleGenerate = async (month: number) => {
    if (!selectedStudent) return toast.error('Select a student');
    setGenerating(true);
    try {
      const res = await financialApi.generateStatement({ student_id: selectedStudent, academic_year: year, month });
      toast.success('Statement generated');
      setSelectedStatement(res.data);
      loadStatements();
    } catch {
      toast.error('Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const getStudentName = (id: string) => {
    const entry = nameMap.get(id);
    if (entry) return entry.name;
    const s = students.find((s) => s.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  const loadSchoolReport = () => {
    if (isParent) return;
    setLoadingSchool(true);
    setPage(1);
    reportsApi
      .statements(year, schoolStatus === 'all' ? undefined : schoolStatus, selectedGrade || undefined)
      .then((r) => setSchoolReport(r.data))
      .catch(() => toast.error('Could not load the school statement summary'))
      .finally(() => setLoadingSchool(false));
  };

  useEffect(() => { loadSchoolReport(); }, [year, schoolStatus, selectedGrade]);

  const handleBulkGenerate = async () => {
    if (!bulkMonth) return toast.error('Select a month');
    setBulking(true);
    try {
      const res = await financialApi.generateAllStatements(year, bulkMonth as number);
      toast.success(`Whole school: ${res.data.generated} generated, ${res.data.skipped} already existed`);
      loadSchoolReport();
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

  const downloadStatement = async (s: Statement) => {
    try {
      await downloadPdf(
        financialApi.statementDownloadUrl(s.student_id, s.academic_year, s.month),
        `statement-${getStudentName(s.student_id).replace(/\s+/g, '-')}-${s.academic_year}-${String(s.month).padStart(2, '0')}.pdf`,
      );
    } catch {
      toast.error('Statement download failed — generate the statement first');
    }
  };

  const visibleStatements = stmtMonth
    ? statements.filter((s) => s.month === stmtMonth)
    : statements;

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
      rows.push({
        date: new Date(p.payment_date).toLocaleDateString(),
        description: `Payment — ${p.payment_method}${p.reference_number ? ` (${p.reference_number})` : ''}`,
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
        <select value={selectedStudent} onChange={(e) => setSelectedStudent(e.target.value)} className="input w-64">
          <option value="">{isParent ? 'Select child' : 'Select Student'}</option>
          {filteredStudents.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.student_number})</option>)}
        </select>
        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="input w-28" />
        <select value={stmtMonth} onChange={(e) => setStmtMonth(e.target.value ? parseInt(e.target.value) : '')} className="input w-44">
          <option value="">All months</option>
          {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
        </select>
        {!isParent && (
          <>
            <select value={genMonth} onChange={(e) => setGenMonth(parseInt(e.target.value))} className="input w-44">
              <option value="">Select month…</option>
              {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
            </select>
            <button
              onClick={() => handleGenerate(genMonth as number)}
              disabled={generating || !genMonth || !selectedStudent}
              className="btn btn-primary"
            >
              {generating ? 'Generating…' : 'Generate'}
            </button>
          </>
        )}
      </div>

      {isParent && (
        <p className="text-sm text-slate-500">
          Statements are generated by the school's finance office. If a month is missing, please contact the office.
        </p>
      )}

      {selectedStatement && (
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Bank Statement — {MONTHS[selectedStatement.month - 1]} {selectedStatement.academic_year}</h2>
              <p className="text-sm text-slate-500">{getStudentName(selectedStatement.student_id)}</p>
            </div>
            <button onClick={() => downloadStatement(selectedStatement)} className="btn btn-secondary">
              <Download className="h-4 w-4" /> Download PDF
            </button>
          </div>

          {loadingLedger ? (
            <div className="flex h-32 items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase">Debit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase">Credit</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 uppercase">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-sm">
                  {buildLedger(selectedStatement).map((row, i) => (
                    <tr key={i} className={row.bold ? 'bg-slate-50 font-semibold' : ''}>
                      <td className="px-4 py-2.5 text-slate-600">{row.date}</td>
                      <td className="px-4 py-2.5 text-slate-800">{row.description}</td>
                      <td className="px-4 py-2.5 text-right text-rose-600">{row.debit ? `R ${row.debit.toLocaleString()}` : ''}</td>
                      <td className="px-4 py-2.5 text-right text-emerald-600">{row.credit ? `R ${row.credit.toLocaleString()}` : ''}</td>
                      <td className="px-4 py-2.5 text-right text-slate-900">{`R ${row.balance.toLocaleString()}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4 flex flex-wrap gap-4 border-t border-slate-100 pt-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Amount due:</span>
              <span className="font-bold text-primary-700">R {selectedStatement.current_amount_due.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Due date:</span>
              <span className="font-semibold">{new Date(selectedStatement.due_date).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">Total annual fees:</span>
              <span>R {selectedStatement.total_fees.toLocaleString()}</span>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
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
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Closing Balance</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Generated</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {visibleStatements.map((s) => (
              <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => setSelectedStatement(s)}>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{MONTHS[s.month - 1]}</td>
                <td className="px-6 py-4 text-sm text-slate-700">R {s.total_installments.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-green-600">R {s.total_payments.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">R {s.closing_balance.toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{new Date(s.generated_at).toLocaleDateString()}</td>
                <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                  <button onClick={() => downloadStatement(s)} className="btn btn-secondary btn-sm">
                    <Download className="h-3.5 w-3.5" /> Download
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visibleStatements.length === 0 && !loading && <p className="py-8 text-center text-sm text-slate-500">{selectedStudent ? (isParent ? 'No statements generated for this child yet.' : 'No statements. Generate one above.') : 'Select a student.'}</p>}
          </>
        )}
      </div>

      {!isParent && (
        <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Whole School — Statement Summary ({year})</h2>
              <p className="text-sm text-slate-500">
                Every approved student's outstanding balance for the year.
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
              <button onClick={exportCsv} className="btn btn-secondary" disabled={!schoolReport || schoolReport.students.length === 0}>
                <Download className="h-4 w-4" /> Export CSV
              </button>
            </div>
          </div>

          <div className="border-b border-slate-100 bg-slate-50/60 px-6 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-slate-500">Generate statements for the whole school:</span>
              <select value={bulkMonth} onChange={(e) => setBulkMonth(parseInt(e.target.value))} className="input w-44">
                <option value="">Select month…</option>
                {MONTHS.map((name, i) => <option key={i} value={i + 1}>{name}</option>)}
              </select>
              <button onClick={handleBulkGenerate} disabled={bulking || !bulkMonth} className="btn btn-primary">
                <FilePlus2 className="h-4 w-4" /> {bulking ? 'Generating…' : 'Generate All'}
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
              {schoolReport && schoolReport.students.length > PAGE_SIZE && (
                <div className="border-t border-slate-100">
                  <Pagination
                    page={page}
                    totalPages={Math.ceil(schoolReport.students.length / PAGE_SIZE)}
                    onPageChange={setPage}
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
