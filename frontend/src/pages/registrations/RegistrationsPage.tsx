import { useEffect, useState } from 'react';
import { studentsApi, gradesApi } from '@/api/client';
import type { Student, Grade } from '@/types';
import toast from 'react-hot-toast';
import { Loader2, UserCheck, Phone, Mail, Check, X, AlertCircle } from 'lucide-react';

const isFather = (t: string) => t === 'father' || t === 'primary';
const isMother = (t: string) => t === 'mother' || t === 'secondary';

export default function RegistrationsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [pending, setPending] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      studentsApi.registrations(50).then((r) => setStudents(r.data)),
      studentsApi.pending(50).then((r) => setPending(r.data)),
    ])
      .catch(() => toast.error('Failed to load registrations'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { gradesApi.list().then((r) => setGrades(r.data)); }, []);
  useEffect(() => { load(); }, []);

  const handleApprove = async (id: string) => {
    try {
      await studentsApi.approve(id);
      toast.success('Registration approved');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Approval failed');
    }
  };

  const handleReject = async (id: string) => {
    try {
      await studentsApi.reject(id);
      toast.success('Registration rejected');
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Rejection failed');
    }
  };

  const gradeName = (id: string) => grades.find((g) => g.id === id)?.name || id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">New Registrations</h1>
        <button onClick={load} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
          Refresh
        </button>
      </div>

      {pending.length > 0 && (
        <div className="rounded-xl bg-white shadow-sm border border-amber-200 overflow-hidden">
          <div className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-6 py-3">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            <h2 className="text-sm font-semibold text-amber-800">Pending Approvals ({pending.length})</h2>
            <p className="text-xs text-amber-600">Parent-submitted registrations awaiting your decision</p>
          </div>
          <div className="divide-y divide-gray-200">
            {pending.map((s) => {
              const p1 = s.guardians?.find((g) => isFather(g.guardian_type));
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{s.first_name} {s.last_name}</p>
                    <p className="text-xs font-mono text-gray-400">{s.student_number} · {gradeName(s.grade_id)}</p>
                    {p1 && (
                      <p className="mt-1 text-xs text-gray-500">
                        Parent: {p1.full_name} {p1.email ? `· ${p1.email}` : ''}
                      </p>
                    )}
                    <p className="text-xs text-gray-400">Submitted {new Date(s.created_at).toLocaleString()}</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(s.id)}
                      className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                    >
                      <Check className="h-3.5 w-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => handleReject(s.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                    >
                      <X className="h-3.5 w-3.5" /> Reject
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registered</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Student</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Father</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mother</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {students.map((s) => {
                  const p1 = s.guardians?.find((g) => isFather(g.guardian_type));
                  const p2 = s.guardians?.find((g) => isMother(g.guardian_type));
                  return (
                    <tr key={s.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">
                        {new Date(s.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{s.first_name} {s.last_name}</p>
                        <p className="text-xs font-mono text-gray-400">{s.student_number}</p>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{gradeName(s.grade_id)}</td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        <span className="inline-flex items-center gap-1">
                          <UserCheck className="h-4 w-4 text-green-500" /> {p1?.full_name || '-'}
                        </span>
                        {p1?.guardian_id && <span className="ml-2 text-xs text-gray-400">ID: {p1.guardian_id}</span>}
                      </td>
                      <td className="px-6 py-4">
                        <div className="space-y-0.5 text-xs text-gray-500">
                          {p1?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {p1.phone}</span>}
                          {p1?.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {p1.email}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">
                        {p2 ? (
                          <>
                            <span className="inline-flex items-center gap-1">
                              <UserCheck className="h-4 w-4 text-blue-500" /> {p2.full_name}
                            </span>
                            {p2.phone && <span className="ml-2 text-xs text-gray-400">{p2.phone}</span>}
                          </>
                        ) : <span className="text-gray-400">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {students.length === 0 && <p className="py-8 text-center text-sm text-gray-500">No registrations yet.</p>}
          </>
        )}
      </div>
    </div>
  );
}
