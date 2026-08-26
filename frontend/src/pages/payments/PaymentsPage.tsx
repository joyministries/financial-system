import { useEffect, useRef, useState } from 'react';
import { paymentsApi } from '@/api/client';
import { getStudentNames } from '@/lib/studentNames';
import type { Payment } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Check, XCircle, RotateCcw, Loader2, Search, MoreHorizontal, Pencil, Trash2, X } from 'lucide-react';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';
import StudentSearchSelect from '@/components/StudentSearchSelect';

const METHODS = ['Bank Transfer', 'EFT', 'Cash', 'Card', 'Mobile Payment'];
const DEFAULT_PAGE_SIZE = 20;

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
  const [searchInput, setSearchInput] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showReverse, setShowReverse] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [namesLoading, setNamesLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [nameMap, setNameMap] = useState<Map<string, { name: string; student_number: string }>>(new Map());

  // Create form
  const [studentId, setStudentId] = useState('');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Bank Transfer');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [refNum, setRefNum] = useState('');

  // Edit form
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editMethod, setEditMethod] = useState('');
  const [editPayDate, setEditPayDate] = useState('');
  const [editRefNum, setEditRefNum] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Dropdown state
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    if (openDropdown) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openDropdown]);

  const load = () => {
    setLoading(true);
    const params: Record<string, string | number> = {
      ...(filter === 'pending' ? { status: 'pending' } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
    if (monthFilter) {
      const [year, month] = monthFilter.split('-').map(Number);
      params.year = year;
      params.month = month;
    }
    paymentsApi.list(params)
      .then((r) => {
        setPayments(r.data.items);
        setTotalCount(r.data.total);
      })
      .catch(() => toast.error('Failed to load payments'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setNamesLoading(true);
    getStudentNames()
      .then(setNameMap)
      .finally(() => setNamesLoading(false));
  }, []);

  useEffect(() => {
    const trimmed = searchInput.trim();
    if (trimmed.length > 0 && trimmed.length < 2) return;
    const t = setTimeout(() => {
      setSearch(trimmed);
      setPage(1);
    }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { load(); }, [filter, monthFilter, search, page, pageSize]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) { toast.error('Please select a student'); return; }
    setSubmitting(true);
    try {
      await paymentsApi.create({
        student_id: studentId, amount, payment_method: method,
        payment_date: new Date(payDate).toISOString(), reference_number: refNum || undefined,
      });
      toast.success('Payment recorded');
      closeForm();
      setPage(1);
      load();
    } catch { toast.error('Failed to record payment'); }
    finally { setSubmitting(false); }
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
      setOpenDropdown(null);
      load();
    } catch { toast.error('Verification failed'); }
  };

  const handleReverse = async () => {
    if (!showReverse) return;
    setSubmitting(true);
    try {
      await paymentsApi.reverse(showReverse, reverseReason);
      toast.success('Payment reversed');
      setShowReverse(null);
      setReverseReason('');
      setOpenDropdown(null);
      load();
    } catch { toast.error('Reversal failed'); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to void this payment? This action cannot be undone.')) {
      setOpenDropdown(null);
      return;
    }
    try {
      await paymentsApi.delete(id);
      toast.success('Payment voided');
      setOpenDropdown(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to void payment');
    }
  };

  const openEdit = (p: Payment) => {
    setEditingPayment(p);
    setEditAmount(String(p.amount));
    setEditMethod(p.payment_method);
    setEditPayDate(p.payment_date.split('T')[0]);
    setEditRefNum(p.reference_number || '');
    setEditNotes(p.notes || '');
    setOpenDropdown(null);
  };

  const handleEdit = async () => {
    if (!editingPayment) return;
    setSubmitting(true);
    try {
      await paymentsApi.edit(editingPayment.id, {
        amount: parseFloat(editAmount),
        payment_method: editMethod,
        payment_date: new Date(editPayDate).toISOString(),
        reference_number: editRefNum || undefined,
        notes: editNotes || undefined,
      });
      toast.success('Payment updated');
      setEditingPayment(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update payment');
    } finally { setSubmitting(false); }
  };

  const getStudentName = (id: string) => {
    const entry = nameMap.get(id);
    return entry ? entry.name : 'Student unavailable';
  };

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const statusBadge = (status: string) => {
    switch (status) {
      case 'verified': return 'badge-success';
      case 'reversed': case 'voided': return 'badge-danger';
      case 'rejected': return 'badge-danger';
      default: return 'badge-warning';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Payments</h1>
        <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input type="text" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search student name…" className="input pl-9 w-56" />
            {searchInput.trim().length === 1 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-slate-400">Type 2+ chars</span>
            )}
          </div>
          <select value={filter} onChange={(e) => { setFilter(e.target.value as 'all' | 'pending'); setPage(1); }} className="input">
            <option value="all">All Payments</option>
            <option value="pending">Pending Verification</option>
          </select>
          <select value={monthFilter} onChange={(e) => { setMonthFilter(e.target.value); setPage(1); }} className="input w-44">
            <option value="">All months</option>
            {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button onClick={() => setShowForm(true)} className="btn btn-primary whitespace-nowrap">
            <Plus className="h-4 w-4" /> Record Payment
          </button>
        </div>
      </div>

      {/* Record Payment Modal */}
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

      {/* Edit Payment Modal */}
      <Modal open={!!editingPayment} onClose={() => setEditingPayment(null)} title="Edit Payment">
        {editingPayment && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Amount (R)</label>
                <input type="number" step="0.01" min="0.01" value={editAmount}
                  onChange={(e) => setEditAmount(e.target.value)} className="input mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Method</label>
                <select value={editMethod} onChange={(e) => setEditMethod(e.target.value)} className="input mt-1">
                  {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Payment Date</label>
                <input type="date" value={editPayDate} onChange={(e) => setEditPayDate(e.target.value)} className="input mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Reference Number</label>
                <input value={editRefNum} onChange={(e) => setEditRefNum(e.target.value)} className="input mt-1" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Notes</label>
              <textarea value={editNotes} onChange={(e) => setEditNotes(e.target.value)} rows={2} className="input mt-1" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleEdit} disabled={submitting} className="btn btn-primary">
                {submitting ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditingPayment(null)} className="btn btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Reverse Payment Modal */}
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

      {/* Payments Table */}
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
            {loading || namesLoading ? (
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
                  <span className={`badge ${statusBadge(p.status)}`}>{p.status}</span>
                </td>
                <td className="px-6 py-4 text-right">
                  {/* Quick actions for pending */}
                  {p.status === 'pending' && (
                    <div className="inline-flex items-center gap-1 mr-2">
                      <button onClick={() => handleVerify(p.id, 'approve')} className="rounded p-1 text-slate-400 hover:text-green-600" title="Approve">
                        <Check className="h-4 w-4" />
                      </button>
                      <button onClick={() => handleVerify(p.id, 'reject')} className="rounded p-1 text-slate-400 hover:text-yellow-600" title="Reject">
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                  {/* More menu */}
                  <div className="relative inline-block" ref={openDropdown === p.id ? dropdownRef : undefined}>
                    <button
                      onClick={() => setOpenDropdown(openDropdown === p.id ? null : p.id)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                      title="More actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {openDropdown === p.id && (
                      <div className="absolute right-0 z-20 mt-1 w-40 rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                        <button
                          onClick={() => openEdit(p)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5 text-blue-500" /> Edit
                        </button>
                        <button
                          onClick={() => handleDelete(p.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-500" /> Delete
                        </button>
                        {p.status !== 'reversed' && p.status !== 'voided' && (
                          <button
                            onClick={() => { setShowReverse(p.id); setOpenDropdown(null); }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-amber-500" /> Reverse
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination page={page} totalPages={totalPages} total={totalCount} pageSize={pageSize} onPageChange={setPage} onPageSizeChange={(s) => { setPageSize(s); setPage(1); }} />
      </div>
    </div>
  );
}
