import { useEffect, useState } from 'react';
import { studentsApi, gradesApi } from '@/api/client';
import type { Student, Grade } from '@/types';
import toast from 'react-hot-toast';
import { Loader2, UserCheck, Phone, Mail, Check, X, Clock3, UserPlus } from 'lucide-react';
import clsx from 'clsx';
import Pagination from '@/components/Pagination';

const DEFAULT_PAGE_SIZE = 20;

const isFather = (t: string) => t === 'father' || t === 'primary';
const isMother = (t: string) => t === 'mother' || t === 'secondary';

/** Human label for the guardian's role on the registration form. */
function roleLabel(t: string | undefined): string {
  if (!t) return '';
  if (t === 'father' || t === 'primary') return 'Father';
  if (t === 'mother' || t === 'secondary') return 'Mother';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.max(1, Math.round((Date.now() - then) / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `${days}d ago`;
}

export default function RegistrationsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [pending, setPending] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const load = () => {
    setLoading(true);
    Promise.all([
      studentsApi.registrations(200).then((r) => setStudents(r.data)),
      studentsApi.pending(200).then((r) => setPending(r.data)),
    ])
      .catch(() => toast.error('Failed to load registrations'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { gradesApi.list().then((r) => setGrades(r.data)); }, []);
  useEffect(() => { load(); }, []);

  const handleApprove = async (id: string) => {
    setActingId(id);
    try {
      await studentsApi.approve(id);
      toast.success('Registration approved');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Approval failed');
    } finally {
      setActingId(null);
    }
  };

  const handleReject = async (id: string) => {
    setActingId(id);
    try {
      await studentsApi.reject(id);
      toast.success('Registration rejected');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Rejection failed');
    } finally {
      setActingId(null);
    }
  };

  const gradeName = (id: string) => grades.find((g) => g.id === id)?.name || id;

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="page-title">New Registrations</h1>
          <p className="page-subtitle">Review parent-submitted registrations and approve or reject them.</p>
        </div>
        <button onClick={load} className="btn btn-secondary">
          <Loader2 className={clsx('h-4 w-4', loading && 'animate-spin')} />
          Refresh
        </button>
      </div>

      {pending.length > 0 && (
        <section className="card overflow-hidden">
          <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-primary-50/60 px-5 py-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-600 text-white">
                <UserPlus className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Pending approvals</h2>
                <p className="text-xs text-slate-500">Awaiting your decision</p>
              </div>
            </div>
            <span className="badge badge-warning">{pending.length} pending</span>
          </header>

          <ul className="divide-y divide-slate-200">
            {pending.map((s) => {
              const p1 = s.guardians?.find((g) => isFather(g.guardian_type));
              const busy = actingId === s.id;
              return (
                <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <p className="text-sm font-semibold text-slate-900">
                        {s.first_name} {s.last_name}
                      </p>
                      <span className="badge badge-neutral">{gradeName(s.grade_id)}</span>
                    </div>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">{s.student_number}</p>
                    {p1 && (
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-500">
                        <UserCheck className="h-3.5 w-3.5 text-slate-400" />
                        {p1.full_name}
                        {p1.email && (
                          <span className="hidden items-center gap-1 sm:inline-flex">
                            <Mail className="h-3 w-3 text-slate-400" /> {p1.email}
                          </span>
                        )}
                        {p1.phone && (
                          <span className="hidden items-center gap-1 md:inline-flex">
                            <Phone className="h-3 w-3 text-slate-400" /> {p1.phone}
                          </span>
                        )}
                      </p>
                    )}
                    <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
                      <Clock3 className="h-3 w-3" /> Submitted {timeAgo(s.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleApprove(s.id)}
                      disabled={actingId !== null}
                      className="btn btn-success btn-sm"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Approve
                    </button>
                    <button
                      onClick={() => handleReject(s.id)}
                      disabled={actingId !== null}
                      className="btn btn-danger btn-sm"
                    >
                      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Reject
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="table-wrap">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Registered</th>
                  <th className="th">Student</th>
                  <th className="th">Grade</th>
                  <th className="th">Parents / Guardians</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {students.slice((page - 1) * pageSize, page * pageSize).map((s) => {
                  const guardians = (s.guardians ?? []).filter(
                    (g) => g.full_name || g.first_name || g.last_name || g.phone || g.email,
                  );
                  return (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="td whitespace-nowrap text-slate-500">
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td className="td">
                        <p className="font-medium text-slate-900">{s.first_name} {s.last_name}</p>
                        <p className="font-mono text-xs text-slate-400">{s.student_number}</p>
                      </td>
                      <td className="td text-slate-500">{gradeName(s.grade_id)}</td>
                      <td className="td">
                        {guardians.length === 0 ? (
                          <span className="text-slate-400">-</span>
                        ) : (
                          <div className="space-y-2">
                            {guardians.map((g) => (
                                <div key={g.id} className="flex items-start gap-2.5">
                                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100">
                                    <UserCheck className={clsx('h-3.5 w-3.5', isMother(g.guardian_type) ? 'text-blue-500' : 'text-green-500')} />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-slate-900">
                                      {g.full_name}
                                      {g.guardian_type && (
                                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-normal uppercase tracking-wide text-slate-500">
                                          {roleLabel(g.guardian_type)}
                                        </span>
                                      )}
                                    </p>
                                    <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-slate-500">
                                      {g.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {g.phone}</span>}
                                      {g.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {g.email}</span>}
                                    </p>
                                  </div>
                                </div>
                              ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {students.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No registrations yet.</p>}
            <Pagination
              page={page}
              totalPages={Math.max(1, Math.ceil(students.length / pageSize))}
              total={students.length}
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
