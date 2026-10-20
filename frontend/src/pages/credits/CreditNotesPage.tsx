import { useEffect, useState } from 'react';
import { creditNotesApi, studentsApi } from '@/api/client';
import type { CreditNote, Student } from '@/types';
import toast from 'react-hot-toast';
import { Plus, HandCoins, FileX2 } from 'lucide-react';
import clsx from 'clsx';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';
import StudentSearchSelect from '@/components/StudentSearchSelect';

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
  issued: 'badge badge-success',
  partial: 'badge badge-info',
  applied: 'badge badge-neutral',
  voided: 'badge badge-danger',
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

  const [studentId, setStudentId] = useState('');
  const [creditType, setCreditType] = useState('Books Sold to School');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [autoApply, setAutoApply] = useState(true);

  useEffect(() => {
    studentsApi.list({ limit: 200 }).then((r) => setStudents(r.data.items));
  }, []);

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
    setCreditType('Books Sold to School');
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink">Credit Notes</h1>
        <div className="flex gap-2">
          <StudentSearchSelect
            value={selectedStudent}
            onChange={setSelectedStudent}
            placeholder="Search student…"
          />
          <button
            onClick={() => setShowForm(true)}
            className="btn btn-primary whitespace-nowrap"
          >
            <Plus className="h-4 w-4" /> Issue Credit Note
          </button>
        </div>
      </div>

      {/* ── Issue credit note modal ─────────────────────── */}
      <Modal open={showForm} onClose={closeForm} title="Issue Credit Note">
        <form onSubmit={handleIssue} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body">Student</label>
            <div className="mt-1">
              <StudentSearchSelect
                value={studentId}
                onChange={setStudentId}
                placeholder="Search student by name or number…"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Credit Type</label>
            <select value={creditType} onChange={(e) => setCreditType(e.target.value)} className="input mt-1">
              {CREDIT_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required className="input mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Amount (R)</label>
            <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="input mt-1" />
          </div>
          <label className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              checked={autoApply}
              onChange={(e) => setAutoApply(e.target.checked)}
              className="h-4 w-4 rounded border-[#d8d2c4] text-primary-800"
            />
            <span className="text-sm text-body">Apply against outstanding balance immediately</span>
          </label>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Issuing…' : 'Issue Credit Note'}
            </button>
            <button type="button" onClick={closeForm} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* ── Table ──────────────────────────────────────── */}
      <div className="rounded-xl bg-white shadow-sm border border-line-soft overflow-x-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
          </div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-[#faf8f2]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Credit No.</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Amount</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Remaining</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pagedCredits.map((c) => (
                  <tr key={c.id} className="hover:bg-[#fdfbf5]">
                    <td className="px-6 py-4 text-sm font-medium text-ink">{c.credit_number}</td>
                    <td className="px-6 py-4 text-sm text-body">{studentName(c.student_id)}</td>
                    <td className="px-6 py-4 text-sm text-muted">{c.credit_type}</td>
                    <td className="px-6 py-4 text-sm text-muted max-w-[200px] truncate">{c.description}</td>
                    <td className="px-6 py-4 text-sm font-medium text-ink text-right">R {Number(c.amount).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-muted text-right">R {Number(c.remaining_amount).toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={clsx('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS_STYLES[c.status] ?? 'badge badge-neutral')}>
                        {STATUS_LABELS[c.status] ?? c.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-1">
                        {c.status === 'issued' && (
                          <button
                            onClick={() => handleApply(c.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#cfe3d8] px-2.5 py-1.5 text-xs font-medium text-[#1c7a4f] hover:bg-[#eef6f1]"
                            title="Apply against outstanding"
                          >
                            <HandCoins className="h-3.5 w-3.5" /> Apply
                          </button>
                        )}
                        {(c.status === 'issued' || c.status === 'partial') && (
                          <button
                            onClick={() => handleVoid(c.id)}
                            className="inline-flex items-center gap-1 rounded-lg border border-[#ecd2cd] px-2.5 py-1.5 text-xs font-medium text-[#8f2e24] hover:bg-[#fbeeec]"
                            title="Void credit note"
                          >
                            <FileX2 className="h-3.5 w-3.5" /> Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {allCredits.length === 0 && !loading && (
              <p className="py-8 text-center text-sm text-muted">
                {selectedStudent ? 'No credit notes for this student.' : 'No credit notes found.'}
              </p>
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
