import { useCallback, useEffect, useState } from 'react';
import { invoicesApi, studentsApi, downloadPdf } from '@/api/client';
import type { Invoice, Student } from '@/types';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Download, FilePlus2 } from 'lucide-react';
import clsx from 'clsx';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const MONTHS_FULL = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
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
  const [students, setStudents] = useState<Student[]>([]);
  const [filterYear, setFilterYear] = useState<number | ''>(yearNow);
  const [filterMonth, setFilterMonth] = useState<number | ''>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterStudent, setFilterStudent] = useState('');

  const [genStudent, setGenStudent] = useState('');
  const [genYear, setGenYear] = useState(yearNow);
  const [genMonth, setGenMonth] = useState(monthNow);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await invoicesApi.list({
        student_id: filterStudent || undefined,
        academic_year: filterYear === '' ? undefined : filterYear,
        month: filterMonth === '' ? undefined : filterMonth,
        status: filterStatus || undefined,
      });
      setInvoices(res.data);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [filterStudent, filterYear, filterMonth, filterStatus]);

  useEffect(() => {
    loadInvoices();
  }, [loadInvoices]);

  useEffect(() => {
    // Parents only ever see their own children (the backend enforces this too).
    studentsApi.list(isParent ? { parent_id: user!.id } : {}).then((r) => setStudents(r.data)).catch(() => setStudents([]));
  }, []);

  const getStudentName = (id: string) => {
    const s = students.find((s) => s.id === id);
    return s ? `${s.first_name} ${s.last_name} (${s.student_number})` : id;
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
        <h1 className="text-2xl font-bold text-slate-900">{isParent ? 'My Invoices' : 'Invoices'}</h1>
        <div className="flex gap-2">
          <select value={filterStudent} onChange={(e) => setFilterStudent(e.target.value)} className="input">
            <option value="">{isParent ? 'All My Children' : 'All Students'}</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
            ))}
          </select>
          <select value={filterYear === '' ? '' : filterYear} onChange={(e) => setFilterYear(e.target.value === '' ? '' : parseInt(e.target.value))} className="input">
            <option value="">All Years</option>
            {[yearNow - 1, yearNow, yearNow + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {!isParent && (
            <select value={filterMonth === '' ? '' : filterMonth} onChange={(e) => setFilterMonth(e.target.value === '' ? '' : parseInt(e.target.value))} className="input">
              <option value="">All Months</option>
              {MONTHS_FULL.map((m, i) => (
                <option key={i} value={i + 1}>{m}</option>
              ))}
            </select>
          )}
          {!isParent && (
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input">
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
        <div className="rounded-xl bg-white p-6 shadow-sm border border-slate-100">
          <h2 className="mb-4 text-lg font-semibold text-slate-900">Generate Invoice</h2>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Student</label>
              <select value={genStudent} onChange={(e) => setGenStudent(e.target.value)} className="input min-w-64">
                <option value="">Select student</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.student_number})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Year</label>
              <select value={genYear} onChange={(e) => setGenYear(parseInt(e.target.value))} className="input">
                {[yearNow - 1, yearNow, yearNow + 1].map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500">Month</label>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Invoice #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Month</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Subtotal</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Paid</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Balance Due</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-mono font-medium text-slate-900">{inv.invoice_number}</td>
                    <td className="px-6 py-4 text-sm text-slate-900">{getStudentName(inv.student_id)}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{MONTHS[inv.month - 1]} {inv.academic_year}</td>
                    <td className="px-6 py-4 text-sm text-slate-700 text-right">R {inv.subtotal.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-green-600 text-right">R {inv.amount_paid.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900 text-right">R {inv.balance_due.toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[inv.status] ?? STATUS_STYLES.draft)}>
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button onClick={() => handleDownload(inv)} title="Download PDF" className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                          <Download className="h-3.5 w-3.5" /> PDF
                        </button>
                        {!isParent && inv.status !== 'paid' && inv.status !== 'void' && (
                          <button onClick={() => handleStatus(inv, 'paid')} className="rounded-lg border border-green-300 px-2.5 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50">
                            Mark paid
                          </button>
                        )}
                        {!isParent && inv.status !== 'void' && inv.status !== 'draft' && (
                          <button onClick={() => handleStatus(inv, 'void')} className="rounded-lg border border-red-300 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50">
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
              <p className="py-8 text-center text-sm text-slate-500">
                {isParent ? 'No invoices for your children yet.' : 'No invoices found. Generate one above.'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
