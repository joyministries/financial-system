import { useEffect, useState } from 'react';
import { paymentsApi, studentsApi } from '@/api/client';
import type { Payment, Student } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Check, XCircle, RotateCcw, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';

const METHODS = ['Bank Transfer', 'EFT', 'Cash', 'Card', 'Mobile Payment'];
const PAGE_SIZE = 20;

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  const [showForm, setShowForm] = useState(false);
  const [showReverse, setShowReverse] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Bank Transfer');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [refNum, setRefNum] = useState('');

  const load = () => {
    setLoading(true);
    const params = {
      ...(filter === 'pending' ? { status: 'pending' } : {}),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    paymentsApi.list(params)
      .then((r) => {
        setPayments(r.data);
        setTotalCount(r.data.length === PAGE_SIZE ? page * PAGE_SIZE + 1 : (page - 1) * PAGE_SIZE + r.data.length);
      })
      .catch(() => toast.error('Failed to load payments'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { studentsApi.list().then((r) => setStudents(r.data)); }, []);
  useEffect(() => { load(); }, [filter, page]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await paymentsApi.create({
        student_id: studentId,
        amount: amount,
        payment_method: method,
        payment_date: new Date(payDate).toISOString(),
        reference_number: refNum || undefined,
      });
      toast.success('Payment recorded');
      closeForm();
      setPage(1);
      load();
    } catch {
      toast.error('Failed to record payment');
    } finally {
      setSubmitting(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setStudentId(''); setAmount('');
    setMethod('Bank Transfer');
    setPayDate(new Date().toISOString().split('T')[0]);
    setRefNum('');
  };

  const handleVerify = async (id: string, action: 'approve' | 'reject') => {
    try {
      const res = await paymentsApi.verify(id, action);
      toast.success(res.data.detail || `Payment ${action}d`);
      load();
    } catch {
      toast.error('Verification failed');
    }
  };

  const handleReverse = async () => {
    if (!showReverse) return;
    setSubmitting(true);
    try {
      await paymentsApi.reverse(showReverse, reverseReason);
      toast.success('Payment reversed');
      setShowReverse(null);
      setReverseReason('');
      load();
    } catch {
      toast.error('Reversal failed');
    } finally {
      setSubmitting(false);
    }
  };

  const getStudentName = (id: string) => {
    const s = students.find((st) => st.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Payments</h1>
        <div className="flex gap-2">
          <select value={filter} onChange={(e) => { setFilter(e.target.value as 'all' | 'pending'); setPage(1); }} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
            <option value="all">All Payments</option>
            <option value="pending">Pending Verification</option>
          </select>
          <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
            <Plus className="h-4 w-4" /> Record Payment
          </button>
        </div>
      </div>

      <Modal open={showForm} onClose={closeForm} title="Record Payment">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Student</label>
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select Student</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.student_number})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Amount (R)</label>
              <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Payment Date</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Reference Number</label>
              <input value={refNum} onChange={(e) => setRefNum(e.target.value)} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {submitting ? 'Recording...' : 'Record'}
            </button>
            <button type="button" onClick={closeForm} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showReverse} onClose={() => { setShowReverse(null); setReverseReason(''); }} title="Reverse Payment">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Reason for reversal</label>
            <textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} required rows={3} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleReverse} disabled={submitting || !reverseReason.trim()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              {submitting ? 'Reversing...' : 'Confirm Reversal'}
            </button>
            <button onClick={() => { setShowReverse(null); setReverseReason(''); }} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </div>
      </Modal>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Method</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" /></td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-500">No payments found.</td></tr>
            ) : payments.map((p) => (
              <tr key={p.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm text-gray-900">{getStudentName(p.student_id)}</td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">R {Number(p.amount).toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{p.payment_method}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{new Date(p.payment_date).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                    p.status === 'verified' ? 'bg-green-100 text-green-700' :
                    p.status === 'reversed' ? 'bg-red-100 text-red-700' :
                    p.status === 'rejected' ? 'bg-orange-100 text-orange-700' :
                    'bg-yellow-100 text-yellow-700'
                  }`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    {p.status === 'pending' && (
                      <>
                        <button onClick={() => handleVerify(p.id, 'approve')} className="rounded p-1 text-gray-400 hover:text-green-600" title="Approve"><Check className="h-4 w-4" /></button>
                        <button onClick={() => handleVerify(p.id, 'reject')} className="rounded p-1 text-gray-400 hover:text-yellow-600" title="Reject"><XCircle className="h-4 w-4" /></button>
                      </>
                    )}
                    {p.status === 'verified' && (
                      <button onClick={() => setShowReverse(p.id)} className="rounded p-1 text-gray-400 hover:text-red-600" title="Reverse"><RotateCcw className="h-4 w-4" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
