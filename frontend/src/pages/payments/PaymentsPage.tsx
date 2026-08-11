import { useEffect, useState } from 'react';
import { paymentsApi } from '@/api/client';
import { getStudentNames } from '@/lib/studentNames';
import type { Payment } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Check, XCircle, RotateCcw, Loader2, Search } from 'lucide-react';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';
import StudentSearchSelect from '@/components/StudentSearchSelect';

const METHODS = ['Bank Transfer', 'EFT', 'Cash', 'Card', 'Mobile Payment'];
const PAGE_SIZE = 20;

// Last 12 calendar months, newest first, for the month filter dropdown.
const monthOptions = (() => {
  const opts: { label: string; value: string }[] = [];
  const now = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    opts.push({
      label: `${d.toLocaleString('en', { month: 'long' })} ${d.getFullYear()}`,
      value: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }
  return opts;
})();

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending'>('all');
  const [monthFilter, setMonthFilter] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showReverse, setShowReverse] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [nameMap, setNameMap] = useState<Map<string, { name: string; student_number: string }>>(new Map());

  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Bank Transfer');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [refNum, setRefNum] = useState('');

  const load = () => {
    setLoading(true);
    const params: Record<string, string | number> = {
      ...(filter === 'pending' ? { status: 'pending' } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      limit: PAGE_SIZE,
      offset: (page - 1) * PAGE_SIZE,
    };
    const countParams: Record<string, string | number> = {
      ...(filter === 'pending' ? { status: 'pending' } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    };
    if (monthFilter) {
      const [year, month] = monthFilter.split('-').map(Number);
      params.year = year;
      params.month = month;
      countParams.year = year;
      countParams.month = month;
    }
    paymentsApi.list(params)
      .then((r) => setPayments(r.data))
      .catch(() => toast.error('Failed to load payments'))
      .finally(() => setLoading(false));
    paymentsApi.count(countParams)
      .then((r) => setTotalCount(r.data.total))
      .catch(() => {});
  };

  useEffect(() => { getStudentNames().then(setNameMap); }, []);
  useEffect(() => { load(); }, [filter, monthFilter, search, page]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      toast.error('Please select a student');
      return;
    }
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
    const entry = nameMap.get(id);
    if (entry) return entry.name;
    return id;
  };

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search student…"
              className="input pl-9 w-52"
            />
          </div>
          <select value={filter} onChange={(e) => { setFilter(e.target.value as 'all' | 'pending'); setPage(1); }} className="input">
            <option value="all">All Payments</option>
            <option value="pending">Pending Verification</option>
          </select>
          <select
            value={monthFilter}
            onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }}
            className="input w-44"
            aria-label="Filter payments by month"
          >
            <option value="">All months</option>
            {monthOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button onClick={() => setShowForm(true)} className="btn btn-primary whitespace-nowrap">
            <Plus className="h-4 w-4" /> Record Payment
          </button>
        </div>
      </div>

      <Modal open={showForm} onClose={closeForm} title="Record Payment">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Student</label>
            <div className="mt-1">
              <StudentSearchSelect value={studentId} onChange={setStudentId} placeholder="Search by name or number…" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Amount (R)</label>
              <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="input mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Method</label>
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="input mt-1">
                {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Payment Date</label>
              <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required className="input mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Reference Number</label>
              <input value={refNum} onChange={(e) => setRefNum(e.target.value)} className="input mt-1" />
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Recording...' : 'Record'}
            </button>
            <button type="button" onClick={closeForm} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showReverse} onClose={() => { setShowReverse(null); setReverseReason(''); }} title="Reverse Payment">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">Reason for reversal</label>
            <textarea value={reverseReason} onChange={(e) => setReverseReason(e.target.value)} required rows={3} className="input mt-1" />
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={handleReverse} disabled={submitting || !reverseReason.trim()} className="btn btn-danger">
              {submitting ? 'Reversing...' : 'Confirm Reversal'}
            </button>
            <button onClick={() => { setShowReverse(null); setReverseReason(''); }} className="btn btn-secondary">Cancel</button>
          </div>
        </div>
      </Modal>

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Student</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Method</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Date</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" /></td></tr>
            ) : payments.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">No payments found.</td></tr>
            ) : payments.map((p) => (
              <tr key={p.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm text-slate-900">{getStudentName(p.student_id)}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">R {Number(p.amount).toLocaleString()}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{p.payment_method}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{new Date(p.payment_date).toLocaleDateString()}</td>
                <td className="px-6 py-4">
                  <span className={`badge ${
                    p.status === 'verified' ? 'badge-success' :
                    p.status === 'reversed' ? 'badge-danger' :
                    p.status === 'rejected' ? 'badge-danger' : 'badge-warning'
                  }`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    {p.status === 'pending' && (
                      <>
                        <button onClick={() => handleVerify(p.id, 'approve')} className="rounded p-1 text-slate-400 hover:text-green-600" title="Approve"><Check className="h-4 w-4" /></button>
                        <button onClick={() => handleVerify(p.id, 'reject')} className="rounded p-1 text-slate-400 hover:text-yellow-600" title="Reject"><XCircle className="h-4 w-4" /></button>
                      </>
                    )}
                    {p.status === 'verified' && (
                      <button onClick={() => setShowReverse(p.id)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Reverse"><RotateCcw className="h-4 w-4" /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} total={totalCount} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </div>
  );
}
