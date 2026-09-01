import { useEffect, useState } from 'react';
import { creditNotesApi, studentsApi } from '@/api/client';
import type { CreditNote, Student } from '@/types';
import toast from 'react-hot-toast';
import { FileMinus2, Plus, XCircle, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';
import StudentSearchSelect from '@/components/StudentSearchSelect';

// A credit note is issued when a student/parent sells books or items to the
// school. The admin decides the credit value, which reduces the student's fee.
const CREDIT_TYPES = [
  'Books Sold to School',
  'Items Sold to School',
  'Uniform Returned',
  'Overpayment',
  'Fee Waiver / Discount',
  'Adjustment',
  'Other',
];
const DEFAULT_PAGE_SIZE = 50;

const STATUS_STYLES: Record<string, string> = {
  issued: 'bg-green-100 text-green-700',
  partial: 'bg-blue-100 text-blue-700',
  applied: 'bg-slate-100 text-slate-600',
  voided: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  issued: 'Issued',
  partial: 'Partially Applied',
  applied: 'Applied',
  voided: 'Voided',
};

export default function CreditNotesPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [allCredits, setAllCredits] = useState<CreditNote[]>([]);
  const [selectedStudent, setSelectedStudent] = useState('');
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  // Form state
  const [studentId, setStudentId] = useState('');
  const [creditType, setCreditType] = useState('Books Sold to School');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [autoApply, setAutoApply] = useState(true);

  useEffect(() => {
    studentsApi.list({ limit: 200 }).then((r) => setStudents(r.data.items));
  }, []);

  // Load credit notes: for the selected student if one is chosen,
  // otherwise the full admin list.
  useEffect(() => {
    setLoading(true);
    setPage(1);
    if (selectedStudent) {
      creditNotesApi
        .listForStudent(selectedStudent)
        .then((r) => setAllCredits(r.data))
        .catch(() => setAllCredits([]))
        .finally(() => setLoading(false));
    } else {
      creditNotesApi
        .listAll()
        .then((r) => setAllCredits(r.data))
        .catch(() => setAllCredits([]))
        .finally(() => setLoading(false));
    }
  }, [selectedStudent]);

  const studentName = (id: string) => {
    const s = students.find((st) => st.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  const pagedCredits = allCredits.slice((page - 1) * pageSize, page * pageSize);

  const refresh = () => {
    if (selectedStudent) {
      creditNotesApi.listForStudent(selectedStudent).then((r) => setAllCredits(r.data));
    } else {
      creditNotesApi.listAll().then((r) => setAllCredits(r.data));
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setStudentId('');
    setCreditType('Book Sale');
    setDescription('');
    setAmount('');
    setAutoApply(true);
  };

  const handleIssue = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (!studentId) return toast.error('Select a student');
      const res = await creditNotesApi.issue({
        student_id: studentId,
        credit_type: creditType,
        description,
        amount,
        auto_apply: autoApply,
      });
      toast.success(`Credit note ${res.data.credit_number} issued`);
      closeForm();
      refresh();
    } catch {
      toast.error('Failed to issue credit note');
    } finally {
      setSubmitting(false);
    }
  };

  const handleApply = async (id: string) => {
    if (!confirm('Apply this credit note against the student\'s outstanding balance?')) return;
    try {
      await creditNotesApi.apply(id);
      toast.success('Credit note applied');
      refresh();
    } catch {
      toast.error('Failed to apply credit note');
    }
  };

  const handleVoid = async (id: string) => {
    const reason = prompt('Reason for voiding this credit note?');
    if (reason === null) return;
    if (!reason.trim()) return toast.error('Void reason is required');
    try {
      await creditNotesApi.void(id, reason);
      toast.success('Credit note voided');
      refresh();
    } catch {
      toast.error('Failed to void credit note');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Credit Notes</h1>
          <p className="mt-1 text-sm text-slate-500">
            Issue a credit when a student or parent sells books/items to the school. The admin sets
            the credit value, which reduces the student's outstanding fees.
          </p>
        </div>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <Plus className="h-4 w-4" /> Issue Credit Note
        </button>
      </div>

      <div className="flex gap-4">
        <StudentSearchSelect
          value={selectedStudent}
          onChange={setSelectedStudent}
          placeholder="Search student by name or number…"
        />
        {!selectedStudent && (
          <p className="text-sm text-slate-500">Showing all students. Pick one to filter.</p>
        )}
      </div>

      <Modal open={showForm} onClose={closeForm} title="Issue Credit Note">
        <form onSubmit={handleIssue} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Student</label>
            <StudentSearchSelect
              value={studentId}
              onChange={setStudentId}
              placeholder="Search student by name or number…"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Credit Type</label>
            <select value={creditType} onChange={(e) => setCreditType(e.target.value)} className="input mt-1">
              {CREDIT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required className="input mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Amount (R)</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="input mt-1" />
          </div>
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600"
            />
            <span className="text-sm text-slate-700">Apply against outstanding balance immediately</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Issuing...' : 'Issue Credit Note'}
            </button>
            <button type="button" onClick={closeForm} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </Modal>

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-x-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Credit No.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Remaining</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pagedCredits.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{c.credit_number}</td>
                    <td className="px-6 py-4 text-sm text-slate-700">{studentName(c.student_id)}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{c.credit_type}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{c.description}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">R {Number(c.amount).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">R {Number(c.remaining_amount).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[c.status] ?? 'bg-slate-100 text-slate-600'}`}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      {c.status === 'issued' && (
                        <button
                          onClick={() => handleApply(c.id)}
                          className="rounded p-1 text-slate-400 hover:text-green-600"
                          title="Apply against outstanding"
                        >
                          <FileMinus2 className="h-4 w-4" />
                        </button>
                      )}
                      {(c.status === 'issued' || c.status === 'partial') && (
                        <button
                          onClick={() => handleVoid(c.id)}
                          className="rounded p-1 text-slate-400 hover:text-red-600 ml-1"
                          title="Void credit note"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allCredits.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-slate-500">No credit notes found.</p>
            )}
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(allCredits.length / pageSize))}
              total={allCredits.length}
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