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
  draft: 'bg-[#f3efe6] text-body',
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

  // Bulk generation by grade. Whole-school runs are scheduled instead — see
  // Admin Settings → Invoice & Statement Auto-generation.
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
    if (!bulkGradeId) return toast.error('Select a grade');
    setBulking(true);
    let generated = 0;
    let skipped = 0;
    let failed = 0;
    let errors: string[] = [];
    try {
      // The endpoint self-limits to fit the serverless timeout and reports
      // complete=false when it still has students left. Re-invoking with the
      // same params resumes because already-generated invoices are skipped, so
      // loop until the whole grade is done.
      for (let attempt = 1; attempt <= 30; attempt++) {
        const res = await invoicesApi.generateAll({
          academic_year: bulkYear,
          month: bulkMonth,
          grade_id: bulkGradeId,
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
        <h1 className="text-2xl font-bold text-ink">{isParent ? 'My Invoices' : 'Invoices'}</h1>
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
        <div className="space-y-6 rounded-xl bg-white p-6 shadow-sm border border-line-soft">
          {/* Bulk generation: one grade (whole school is scheduled instead) */}
          <div>
            <h2 className="mb-1 text-lg font-semibold text-ink">Generate Invoices (Bulk)</h2>
            <p className="mb-4 text-sm text-muted">
              Create the monthly invoice for every student in a grade. Parents automatically
              receive an SMS with their invoice amount. Whole-school runs are handled by the
              schedule in Admin Settings → Invoice &amp; Statement Auto-generation.
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Grade</label>
                <select value={bulkGradeId} onChange={(e) => setBulkGradeId(e.target.value)} className="input min-w-40">
                  <option value="">Select grade</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Year</label>
                <select value={bulkYear} onChange={(e) => setBulkYear(parseInt(e.target.value))} className="input">
                  {[yearNow - 1, yearNow, yearNow + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Month</label>
                <select value={bulkMonth} onChange={(e) => setBulkMonth(parseInt(e.target.value))} className="input">
                  {MONTHS_FULL.map((m, i) => (
                    <option key={i} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">SMS parents</label>
                <div className="inline-flex h-9 overflow-hidden rounded-lg border border-line">
                  <button
                    type="button"
                    onClick={() => setBulkNotify(true)}
                    className={`px-3.5 text-[12.5px] font-semibold transition-colors ${bulkNotify ? 'bg-primary-900 text-white' : 'bg-white text-muted hover:text-ink'}`}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkNotify(false)}
                    className={`border-l border-line px-3.5 text-[12.5px] font-semibold transition-colors ${!bulkNotify ? 'bg-primary-900 text-white' : 'bg-white text-muted hover:text-ink'}`}
                  >
                    No
                  </button>
                </div>
              </div>
              <button
                onClick={handleBulkGenerate}
                disabled={bulking}
                className="btn btn-primary"
              >
                {bulking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Layers className="h-4 w-4" />}
                {bulking ? 'Generating…' : 'Generate for Grade'}
              </button>
            </div>
          </div>

          <div className="border-t border-line-soft pt-5">
            <h2 className="mb-4 text-lg font-semibold text-ink">Generate Invoice (Single Student)</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Grade</label>
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
                <label className="mb-1 block text-xs font-medium text-muted">Student</label>
                <StudentSearchSelect
                  value={genStudent}
                  onChange={setGenStudent}
                  placeholder="Search student by name or number…"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Year</label>
                <select value={genYear} onChange={(e) => setGenYear(parseInt(e.target.value))} className="input">
                  {[yearNow - 1, yearNow, yearNow + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted">Month</label>
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

      <div className="rounded-xl bg-white shadow-sm border border-line-soft overflow-x-auto">
        {loading || namesLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-[#faf8f2]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Invoice #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Month</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Subtotal</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Paid</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Balance Due</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-[#fdfbf5]">
                    <td className="px-6 py-4 text-sm font-mono font-medium text-ink">{inv.invoice_number}</td>
                    <td className="px-6 py-4 text-sm text-ink">{getStudentName(inv.student_id)}</td>
                    <td className="px-6 py-4 text-sm text-muted">{MONTHS[inv.month - 1]} {inv.academic_year}</td>
                    <td className="px-6 py-4 text-sm text-body text-right">R {inv.subtotal.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-[#1c7a4f] text-right">R {inv.amount_paid.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-medium text-ink text-right">R {inv.balance_due.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft)}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => handleDownload(inv)} title="Download PDF" className="inline-flex items-center gap-1 rounded-lg border border-[#d8d2c4] px-2.5 py-1.5 text-xs font-medium text-body hover:bg-[#fdfbf5]">
                          <Download className="h-3.5 w-3.5" /> PDF
                        </button>
                        {!isParent && inv.status !== 'paid' && inv.status !== 'void' && (
                          <button onClick={() => handleStatus(inv, 'paid')} className="rounded-lg border border-[#cfe3d8] px-2.5 py-1.5 text-xs font-medium text-[#1c7a4f] hover:bg-[#eef6f1]">
                            Mark paid
                          </button>
                        )}
                        {!isParent && inv.status !== 'void' && inv.status !== 'draft' && (
                          <button onClick={() => handleStatus(inv, 'void')} className="rounded-lg border border-[#ecd2cd] px-2.5 py-1.5 text-xs font-medium text-[#8f2e24] hover:bg-[#fbeeec]">
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
              <p className="py-8 text-center text-sm text-muted">
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
