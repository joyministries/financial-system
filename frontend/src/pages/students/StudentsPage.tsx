import { useEffect, useState } from 'react';
import { studentsApi, gradesApi } from '@/api/client';
import type { Student, Grade } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Pencil, UserX, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [filterGrade, setFilterGrade] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [studentNum, setStudentNum] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [enrollDate, setEnrollDate] = useState(new Date().toISOString().split('T')[0]);

  // Two parents: primary compulsory, secondary optional
  const [p1First, setP1First] = useState('');
  const [p1Last, setP1Last] = useState('');
  const [p1Id, setP1Id] = useState('');
  const [p1Phone, setP1Phone] = useState('');
  const [p1Email, setP1Email] = useState('');
  const [p1Address, setP1Address] = useState('');
  const [p1PoBox, setP1PoBox] = useState('');
  const [p2First, setP2First] = useState('');
  const [p2Last, setP2Last] = useState('');
  const [p2Id, setP2Id] = useState('');
  const [p2Phone, setP2Phone] = useState('');
  const [p2Email, setP2Email] = useState('');
  const [p2Address, setP2Address] = useState('');
  const [p2PoBox, setP2PoBox] = useState('');

  const load = () => {
    setLoading(true);
    const params = filterGrade ? { grade_id: filterGrade } : undefined;
    studentsApi.list(params)
      .then((r) => setStudents(r.data))
      .catch(() => toast.error('Failed to load students'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { gradesApi.list().then((r) => setGrades(r.data)); }, []);
  useEffect(() => { load(); }, [filterGrade]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await studentsApi.update(editingId, { first_name: firstName, last_name: lastName, grade_id: gradeId });
        toast.success('Student updated');
      } else {
        await studentsApi.create({
          student_number: studentNum,
          first_name: firstName,
          last_name: lastName,
          grade_id: gradeId,
          enrollment_date: new Date(enrollDate).toISOString(),
          parent_1: {
            first_name: p1First,
            last_name: p1Last,
            guardian_id: p1Id || undefined,
            phone: p1Phone || undefined,
            email: p1Email || undefined,
            physical_address: p1Address || undefined,
            po_box: p1PoBox || undefined,
          },
          ...(p2First || p2Last ? {
            parent_2: {
              first_name: p2First || undefined,
              last_name: p2Last || undefined,
              guardian_id: p2Id || undefined,
              phone: p2Phone || undefined,
              email: p2Email || undefined,
              physical_address: p2Address || undefined,
              po_box: p2PoBox || undefined,
            },
          } : {}),
        });
        toast.success('Student created');
      }
      closeForm();
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setStudentNum(''); setFirstName(''); setLastName('');
    setGradeId(''); setEnrollDate(new Date().toISOString().split('T')[0]);
    setP1First(''); setP1Last(''); setP1Id(''); setP1Phone(''); setP1Email('');
    setP1Address(''); setP1PoBox('');
    setP2First(''); setP2Last(''); setP2Id(''); setP2Phone(''); setP2Email('');
    setP2Address(''); setP2PoBox('');
  };

  const handleEdit = (s: Student) => {
    setEditingId(s.id);
    setFirstName(s.first_name);
    setLastName(s.last_name);
    setGradeId(s.grade_id);
    setShowForm(true);
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this student?')) return;
    try {
      await studentsApi.deactivate(id);
      toast.success('Student deactivated');
      load();
    } catch { toast.error('Failed to deactivate'); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Students</h1>
        <button onClick={() => setShowForm(true)} className="flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
          <Plus className="h-4 w-4" /> Add Student
        </button>
      </div>

      <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
        <option value="">All Grades</option>
        {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>

      <Modal open={showForm} onClose={closeForm} title={editingId ? 'Edit Student' : 'New Student'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editingId && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Student Number</label>
                <input value={studentNum} onChange={(e) => setStudentNum(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
                <p className="mb-2 text-sm font-semibold text-primary-700">Father (required)</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p1First} onChange={(e) => setP1First(e.target.value)} required placeholder="First name" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <input value={p1Last} onChange={(e) => setP1Last(e.target.value)} required placeholder="Last name" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <input value={p1Id} onChange={(e) => setP1Id(e.target.value)} placeholder="ID Number (optional)" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p1Phone} onChange={(e) => setP1Phone(e.target.value)} placeholder="Phone" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <input value={p1Email} onChange={(e) => setP1Email(e.target.value)} type="email" placeholder="Email" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p1Address} onChange={(e) => setP1Address(e.target.value)} placeholder="Physical address" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <input value={p1PoBox} onChange={(e) => setP1PoBox(e.target.value)} placeholder="PO Box" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="mb-2 text-sm font-semibold text-gray-700">Mother (optional)</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p2First} onChange={(e) => setP2First(e.target.value)} placeholder="First name" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <input value={p2Last} onChange={(e) => setP2Last(e.target.value)} placeholder="Last name" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <input value={p2Id} onChange={(e) => setP2Id(e.target.value)} placeholder="ID Number (optional)" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p2Phone} onChange={(e) => setP2Phone(e.target.value)} placeholder="Phone" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <input value={p2Email} onChange={(e) => setP2Email(e.target.value)} type="email" placeholder="Email" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p2Address} onChange={(e) => setP2Address(e.target.value)} placeholder="Physical address" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                    <input value={p2PoBox} onChange={(e) => setP2PoBox(e.target.value)} placeholder="PO Box" className="block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Grade</label>
            <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="">Select</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          {!editingId && (
            <div>
              <label className="block text-sm font-medium text-gray-700">Enrollment Date</label>
              <input type="date" value={enrollDate} onChange={(e) => setEnrollDate(e.target.value)} required className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50">
              {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={closeForm} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
          </div>
        </form>
      </Modal>

      <div className="rounded-xl bg-white shadow-sm border border-gray-100 overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Number</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Grade</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Parents</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" /></td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-gray-500">No students found.</td></tr>
            ) : students.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-sm font-mono text-gray-700">{s.student_number}</td>
                <td className="px-6 py-4 text-sm font-medium text-gray-900">{s.first_name} {s.last_name}</td>
                <td className="px-6 py-4 text-sm text-gray-500">{grades.find((g) => g.id === s.grade_id)?.name || s.grade_id}</td>
                <td className="px-6 py-4">
                  <div className="text-sm text-gray-700">
                    {s.guardians?.map((g) => (
                      <div key={g.id} className="flex items-center gap-1">
                        <span className="text-gray-400">{g.guardian_type === 'mother' || g.guardian_type === 'secondary' ? 'Mo' : 'Fa'}</span>
                        <span>{g.full_name}</span>
                      </div>
                    ))}
                    {(!s.guardians || s.guardians.length === 0) && <span className="text-gray-400">-</span>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${s.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => handleEdit(s)} className="rounded p-1 text-gray-400 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDeactivate(s.id)} className="rounded p-1 text-gray-400 hover:text-red-600" title="Deactivate"><UserX className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
