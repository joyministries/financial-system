import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Trash2, Check, X, Mail, Clock3, AlertTriangle } from 'lucide-react';
import clsx from 'clsx';
import { deletionApi, type DataDeletionRequest } from '@/api/client';
import Pagination from '@/components/Pagination';

const PAGE_SIZE = 20;
type Filter = 'pending' | 'approved' | 'rejected' | 'all';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Pending' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
];

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export default function DeletionRequestsPage() {
  const [filter, setFilter] = useState<Filter>('pending');
  const [rows, setRows] = useState<DataDeletionRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [actingId, setActingId] = useState<string | null>(null);

  // Approve confirm modal
  const [confirming, setConfirming] = useState<DataDeletionRequest | null>(null);
  // Reject modal
  const [rejecting, setRejecting] = useState<DataDeletionRequest | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    deletionApi
      .list({
        status: filter === 'all' ? undefined : filter,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
      .then((r) => {
        setRows(r.data.items);
        setTotal(r.data.total);
      })
      .catch(() => toast.error('Failed to load deletion requests'))
      .finally(() => setLoading(false));
  }, [filter, page]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async () => {
    if (!confirming) return;
    setActingId(confirming.id);
    setBusy(true);
    try {
      await deletionApi.approve(confirming.id);
      toast.success('Request approved — account deactivated and anonymised');
      setConfirming(null);
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Approval failed');
      setConfirming(null);
    } finally {
      setActingId(null);
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!rejecting) return;
    if (!rejectReason.trim()) return toast.error('Please give a reason for the rejection');
    setActingId(rejecting.id);
    setBusy(true);
    try {
      await deletionApi.reject(rejecting.id, rejectReason.trim());
      toast.success('Request rejected');
      setRejecting(null);
      setRejectReason('');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Rejection failed');
      setRejecting(null);
    } finally {
      setActingId(null);
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">Deletion Requests</h1>
          <p className="page-subtitle">
            Parents exercising their POPIA erasure right. Approving deactivates the account and
            anonymises their personal details (financial records are kept by law).
          </p>
        </div>
        <button onClick={load} className="btn btn-secondary">
          <Loader2 className={clsx('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => { setFilter(f.key); setPage(1); }}
            className={clsx(
              'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
              filter === f.key
                ? 'bg-[#131d3c] text-white'
                : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="table-wrap">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No {filter} deletion requests.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="th">Requested</th>
                <th className="th">Parent (account at request time)</th>
                <th className="th">Reason</th>
                <th className="th">Status</th>
                <th className="th">Decision</th>
                <th className="th text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {rows.map((d) => {
                const busyRow = actingId === d.id;
                const pending = d.status === 'pending';
                return (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="td whitespace-nowrap">
                      <span className="flex items-center gap-1.5 text-slate-600">
                        <Clock3 className="h-3.5 w-3.5 text-slate-400" />
                        {fmtDate(d.created_at)}
                      </span>
                    </td>
                    <td className="td">
                      <p className="font-medium text-slate-900">{d.user_full_name || '—'}</p>
                      <p className="flex items-center gap-1 text-xs text-slate-500">
                        <Mail className="h-3 w-3 text-slate-400" /> {d.email}
                      </p>
                    </td>
                    <td className="td">
                      <p className="max-w-md text-sm text-slate-600">{d.reason || '—'}</p>
                    </td>
                    <td className="td">
                      <span
                        className={clsx(
                          'badge',
                          d.status === 'pending' && 'badge-warning',
                          d.status === 'approved' && 'badge-success',
                          d.status === 'rejected' && 'badge-danger'
                        )}
                      >
                        {d.status}
                      </span>
                      {d.rejection_reason && (
                        <p className="mt-1 max-w-xs text-xs text-slate-400">
                          {d.rejection_reason}
                        </p>
                      )}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">
                      {d.decided_at ? fmtDate(d.decided_at) : '—'}
                    </td>
                    <td className="td">
                      <div className="flex justify-end gap-2">
                        {pending ? (
                          <>
                            <button
                              onClick={() => setConfirming(d)}
                              disabled={actingId !== null}
                              className="btn btn-success btn-sm"
                            >
                              {busyRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                              Approve
                            </button>
                            <button
                              onClick={() => { setRejecting(d); setRejectReason(''); }}
                              disabled={actingId !== null}
                              className="btn btn-danger btn-sm"
                            >
                              {busyRow ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                              Reject
                            </button>
                          </>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {!loading && total > 0 && (
          <Pagination
            page={page}
            totalPages={Math.max(1, Math.ceil(total / PAGE_SIZE))}
            total={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            onPageSizeChange={() => {}}
          />
        )}
      </div>

      {/* Approve confirm modal */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold text-slate-900">Approve deletion for {confirming.email}?</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  The parent's account will be deactivated immediately and their name, email, phone
                  and other personal details anonymised. They will no longer be able to sign in.
                  Invoices, payments, receipts and statements are kept for statutory audit/tax
                  purposes. This cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirming(null)} disabled={busy} className="btn btn-outline">
                Cancel
              </button>
              <button onClick={handleApprove} disabled={busy} className="btn btn-success">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Approve & deactivate
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject modal */}
      {rejecting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-base font-semibold text-slate-900">Reject deletion request</h3>
            <p className="mt-1 text-sm text-slate-500">
              The account is left unchanged. Explain why the request is being refused —
              this is recorded with the request and in the audit log.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={4}
              maxLength={500}
              placeholder="e.g. The learner is still enrolled and the account is needed."
              className="mt-3 block w-full rounded-xl border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejecting(null)} disabled={busy} className="btn btn-outline">
                Cancel
              </button>
              <button onClick={handleReject} disabled={busy || !rejectReason.trim()} className="btn btn-danger">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Reject request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}