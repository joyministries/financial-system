import { useCallback, useEffect, useState } from 'react';
import { invoicesApi, studentsApi, gradesApi, downloadPdf } from '@/api/client';
import { getStudentNames } from '@/lib/studentNames';
import type { Invoice, Student, Grade } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Download, FilePlus2, Layers, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import Pagination from '@/components/Pagination';
import StudentSearchSelect from '@/components/StudentSearchSelect';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DEFAULT_PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-ledger-ink',
  issued: 'badge badge-info',
  paid: 'badge badge-success',
  void: 'badge badge-danger',
};

export default function InvoicesPage() {
  const { user } = useAuth();
  const isParent = user?.role === 'parent';
  const yearNow = new Date().getFullYear();
  const monthNow = new Date().getMonth() + 1;

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [filterGradeId, setFilterGradeId] = useState('');
  const [filterYear, setFilterYear] = useState<number | ''>(yearNow);
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterStudent, setFilterStudent] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const [genStudent, setGenStudent] = useState('');
  const [genYear, setGenYear] = useState(yearNow);
  const [genMonth, setGenMonth] = useState(monthNow);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [namesLoading, setNamesLoading] = useState(true);

  // Bulk generation (whole grade / whole school)
  const [bulkScope, setBulkScope] = useState<'all' | 'grade'>('all');
  const [bulkGradeId, setBulkGradeId] = useState('');
  const [bulkYear, setBulkYear] = useState(yearNow);
  const [bulkMonth, setBulkMonth] = useState(monthNow);
  const [bulkNotify, setBulkNotify] = useState(true);
  const [bulking, setBulking] = useState(false);
  const [nameMap, setNameMap] = useState<Map<string, { name: string; student_number: string }>>(new Map());

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicesApi.list({
        student_id: filterStudent || undefined,
        academic_year: filterYear === '' ? undefined : filterYear,
        month: filterMonth === '' ? undefined : filterMonth,
        status: filterStatus || undefined,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      setInvoices(res.data.items);
      setTotalCount(res.data.total);
    } catch {
      setInvoices([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [filterStudent, filterYear, filterMonth, filterStatus, page, pageSize]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => { setPage(1); }, [filterStudent, filterYear, filterMonth, filterStatus]);

  useEffect(() => {
    // Parents only ever see their own children (the backend enforces this too).
    studentsApi.list(isParent ? { parent_id: user!.id, limit: 200 } : { limit: 200 }).then((r) => setStudents(r.data.items)).catch(() => setStudents([]));
    gradesApi.list().then((r) => setGrades(r.data)).catch(() => setGrades([]));
    getStudentNames().then(setNameMap).finally(() => setNamesLoading(false));
  }, []);

  const getStudentName = (id: string) => {
    const entry = nameMap.get(id);
    if (entry) return `${entry.name} (${entry.student_number})`;
    const s = students.find((s) => s.id === id);
    return s ? `${s.first_name} ${s.last_name} (${s.student_number})` : 'Student unavailable';
  };

  const handleGenerate = async () => {
    if (!genStudent) return toast.error('Select a student');
    setGenerating(true);
    try {
      const res = await invoicesApi.generate({
        student_id: genStudent,
        academic_year: genYear,
        month: genMonth,
      });
      toast.success(`Invoice ${res.data.invoice_number} generated`);
      setFilterYear(genYear);
      setFilterMonth(genMonth);
      setFilterStatus('');
      await loadInvoices();
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleBulkGenerate = async () => {
    if (bulkScope === 'grade' && !bulkGradeId) return toast.error('Select a grade');
    setBulking(true);
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    let errors: string[] = [];
    try {
      // The endpoint self-limits to fit the serverless timeout and reports
      // complete=false when it still has students left. Re-invoking with the
      // same params resumes because already-generated invoices are skipped, so
      // loop until the whole school / grade is done.
      for (let attempt = 1; attempt <= 30; attempt++) {
        const res = await invoicesApi.generateAll({
          academic_year: bulkYear,
          month: bulkMonth,
          grade_id: bulkScope === 'grade' ? bulkGradeId : undefined,
          notify_parents: bulkNotify,
        });
        generated += res.data.generated;
        skipped += res.data.skipped;
        failed += res.data.failed;
        errors = errors.concat(res.data.errors);
        if (res.data.complete) break;
        await new Promise((r) => setTimeout(r, 800));
      }
      toast.success(
        `${generated} invoice${generated === 1 ? '' : 's'} generated, ${skipped} already existed` +
          (failed ? `, ${failed} failed` : ''),
      );
      if (errors.length) console.warn('Bulk generation errors:', errors);
      setFilterYear(bulkYear);
      setFilterMonth(bulkMonth);
      setFilterStatus('');
      await loadInvoices();
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(
        detail ||
          'Bulk generation may have timed out. Invoices already created are never duplicated — run again to continue where it stopped.',
      );
      await loadInvoices();
    } finally {
      setBulking(false);
    }
  };

  const handleDownload = async (inv: Invoice) => {
    try {
      await downloadPdf(invoicesApi.downloadUrl(inv.id), `${inv.invoice_number}.pdf`);
    } catch {
      toast.error('Invoice download failed');
    }
  };

  const handleStatus = async (inv: Invoice, status: 'paid' | 'void') => {
    try {
      await invoicesApi.updateStatus(inv.id, status);
      toast.success(`Invoice ${status}`);
      await loadInvoices();
    } catch (e: unknown) {
      const detail =
        (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(detail || 'Update failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ledger-ink">{isParent ? 'My Invoices' : 'Invoices'}</h1>
        <div className="flex gap-2">
          {!isParent && (
            <select
              value={filterGradeId}
              onChange={(e) => { setFilterGradeId(e.target.value); setFilterStudent(''); setPage(1); }}
              className="input"
            >
              <option value="">All Grades</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          )}
          <StudentSearchSelect
            value={filterStudent}
            onChange={(id) => { setFilterStudent(id); setPage(1); }}
            placeholder={isParent ? 'Search my children…' : 'Search student…'}
          />
          <select value={filterYear === '' ? '' : filterYear} onChange={(e) => { setFilterYear(e.target.value === '' ? '' : parseInt(e.target.value)); setPage(1); }} className="input">
            <option value="">All Years</option>
            {[yearNow - 1, yearNow, yearNow + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {!isParent && (
            <select value={filterMonth === '' ? '' : filterMonth} onChange={(e) => { setFilterMonth(e.target.value === '' ? '' : parseInt(e.target.value)); setPage(1); }} className="input">
              <option value="">All Months</option>
              {MONTHS_FULL.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          )}
          {!isParent && (
            <select value={filterStatus} onChange={(e) => { setFilterStatus(e.target.value); setPage(1); }} className="input">
              <option value="">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="issued">Issued</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
          )}
        </div>
      </div>

      {!isParent && (
        <div className="card space-y-6 p-6">
          {/* Bulk generation: whole grade / whole school */}
          <div>
            <h2 className="mb-1 text-lg font-semibold text-ledger-ink">Generate Invoices (Bulk)</h2>
            <p className="mb-4 text-sm text-ledger-muted">
              Create the monthly invoice for every student in a grade — or the whole school.
              Parents automatically receive an SMS with their invoice amount.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ledger-muted">Scope</label>
                <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
                  <button
                    type="button"
                    onClick={() => setBulkScope('grade')}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${bulkScope === 'grade' ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    By Grade
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkScope('all')}
                    className={`rounded-md px-3 py-1.5 text-sm font-medium ${bulkScope === 'all' ? 'bg-primary-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Whole School
                  </button>
                </div>
              </div>
              {bulkScope === 'grade' && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-ledger-muted">Grade</label>
                  <select value={bulkGradeId} onChange={(e) => setBulkGradeId(e.target.value)} className="input min-w-40">
                    <option value="">Select grade</option>
                    {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-ledger-muted">Year</label>
                <select value={bulkYear} onChange={(e) => setBulkYear(parseInt(e.target.value))} className="input">
                  {[yearNow - 1, yearNow, yearNow + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ledger-muted">Month</label>
                <select value={bulkMonth} onChange={(e) => setBulkMonth(parseInt(e.target.value))} className="input">
                  {MONTHS_FULL.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ledger-muted">SMS parents</label>
                <button
                  type="button"
                  onClick={() => setBulkNotify((v) => !v)}
                  className={`rounded-lg border px-3 py-2 text-sm font-medium ${bulkNotify ? 'border-primary-600 bg-primary-600 text-white' : 'border-ledger-border text-ledger-muted hover:bg-ledger-row-hover'}`}
                >
                  {bulkNotify ? 'Yes' : 'No'}
                </button>
              </div>
              <button
                onClick={handleBulkGenerate}
                disabled={bulking}
                className="btn btn-primary"
              >
                {bulking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                {bulking ? 'Generating…' : `Generate for ${bulkScope === 'grade' ? 'Grade' : 'School'}`}
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <h2 className="mb-4 text-lg font-semibold text-ledger-ink">Generate Invoice (Single Student)</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-ledger-muted">Grade</label>
                <select
                  value={filterGradeId}
                  onChange={(e) => { setFilterGradeId(e.target.value); setGenStudent(''); }}
                  className="input min-w-40"
                >
                  <option value="">All grades</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ledger-muted">Student</label>
                <StudentSearchSelect
                  value={genStudent}
                  onChange={setGenStudent}
                  placeholder="Search student by name or number…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ledger-muted">Year</label>
                <select value={genYear} onChange={(e) => setGenYear(parseInt(e.target.value))} className="input">
                  {[yearNow - 1, yearNow, yearNow + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-ledger-muted">Month</label>
                <select value={genMonth} onChange={(e) => setGenMonth(parseInt(e.target.value))} className="input">
                  {MONTHS_FULL.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="btn btn-primary"
              >
                <FilePlus2 className="h-4 w-4" /> {generating ? 'Generating…' : 'Generate'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="table-wrap">
        {loading || namesLoading ? (
          <div className="p-0"><div className="skeleton-row" /><div className="skeleton-row" /><div className="skeleton-row" /><div className="skeleton-row" /></div>
        ) : (
          <>
            <table className="ledger-table">
              <thead className="bg-ledger-bg">
                <tr>
                  <th className="th">Invoice #</th>
                  <th className="th">Student</th>
                  <th className="th">Month</th>
                  <th className="th th-num">Subtotal</th>
                  <th className="th th-num">Paid</th>
                  <th className="th th-num">Balance Due</th>
                  <th className="th">Status</th>
                  <th className="th th-num">Actions</th>
                </tr>
              </thead>
              <tbody className="">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-ledger-row-hover">
                    <td className="td font-mono font-medium">{inv.invoice_number}</td>
                    <td className="td">{getStudentName(inv.student_id)}</td>
                    <td className="td td-muted">{MONTHS[inv.month - 1]} {inv.academic_year}</td>
                    <td className="td td-muted text-right">R {inv.subtotal.toLocaleString()}</td>
                    <td className="td td-num td-muted">R {inv.amount_paid.toLocaleString()}</td>
                    <td className="td font-medium text-right">R {inv.balance_due.toLocaleString()}</td>
                    <td className="td td-status">
                      <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft)}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="td text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => handleDownload(inv)} title="Download PDF" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-ledger-ink hover:bg-slate-50">
                          <Download className="h-3.5 w-3.5" /> PDF
                        </button>
                        {!isParent && inv.status !== 'paid' && inv.status !== 'void' && (
                          <button onClick={() => handleStatus(inv, 'paid')} className="rounded-lg border border-ledger-border px-2.5 py-1.5 text-xs font-medium text-ledger-ink hover:bg-ledger-row-hover">
                            Mark paid
                          </button>
                        )}
                        {!isParent && inv.status !== 'void' && inv.status !== 'draft' && (
                          <button onClick={() => handleStatus(inv, 'void')} className="rounded-lg border border-ledger-border px-2.5 py-1.5 text-xs font-medium text-ledger-ink hover:bg-ledger-row-hover">
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {invoices.length === 0 && (
              <p className="py-8 text-center text-sm text-ledger-muted">
                {isParent ? 'No invoices for your children yet.' : 'No invoices found. Generate one above.'}
              </p>
            )}
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
              total={totalCount}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            />
          </>
        )}
      </div>
    </div>
  );
}
