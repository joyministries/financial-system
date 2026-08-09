import { useEffect, useState } from 'react';
import { studentsApi, gradesApi } from '@/api/client';
import type { AdminStudentRegisterResponse, Student, Grade } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Pencil, UserX, UserPlus, Copy, Loader2 } from 'lucide-react';
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

  // Admin self-service: register student + create/link parent account
  const [showAdminRegister, setShowAdminRegister] = useState(false);
  const [adminRegisterResult, setAdminRegisterResult] =
    useState<AdminStudentRegisterResponse | null>(null);
  const [arFirstName, setArFirstName] = useState('');
  const [arLastName, setArLastName] = useState('');
  const [arGradeId, setArGradeId] = useState('');
  const [arParentName, setArParentName] = useState('');
  const [arParentEmail, setArParentEmail] = useState('');
  const [arRelationship, setArRelationship] = useState<'father' | 'mother'>('father');
  const [arGuardianId, setArGuardianId] = useState('');
  const [arPhone, setArPhone] = useState('');
  const [arAddress, setArAddress] = useState('');
  const [arPoBox, setArPoBox] = useState('');
  const [arOtherFirst, setArOtherFirst] = useState('');
  const [arOtherLast, setArOtherLast] = useState('');
  const [arOtherPhone, setArOtherPhone] = useState('');
  const [arOtherEmail, setArOtherEmail] = useState('');

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

  const closeAdminRegister = () => {
    setShowAdminRegister(false);
    setAdminRegisterResult(null);
    setArFirstName(''); setArLastName(''); setArGradeId('');
    setArParentName(''); setArParentEmail(''); setArRelationship('father');
    setArGuardianId(''); setArPhone(''); setArAddress(''); setArPoBox('');
    setArOtherFirst(''); setArOtherLast(''); setArOtherPhone(''); setArOtherEmail('');
  };

  const handleAdminRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await studentsApi.adminRegister({
        first_name: arFirstName,
        last_name: arLastName,
        grade_id: arGradeId,
        parent_email: arParentEmail,
        parent_full_name: arParentName,
        relationship: arRelationship,
        guardian_id: arGuardianId || undefined,
        phone: arPhone || undefined,
        physical_address: arAddress || undefined,
        po_box: arPoBox || undefined,
        ...(arOtherFirst || arOtherLast ? {
          other_parent: {
            first_name: arOtherFirst || undefined,
            last_name: arOtherLast || undefined,
            phone: arOtherPhone || undefined,
            email: arOtherEmail || undefined,
          },
        } : {}),
      });
      setAdminRegisterResult(data);
      if (data.temporary_password) {
        toast.success('Student registered and parent account created');
      } else {
        toast.success('Student registered, linked to existing parent account');
      }
      load();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const copyCredentials = async () => {
    if (!adminRegisterResult?.temporary_password) return;
    const text =
      `Email: ${adminRegisterResult.parent.email}\nPassword: ${adminRegisterResult.temporary_password}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Credentials copied');
    } catch {
      toast.error('Copy failed — copy manually below');
    }
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
        <h1 className="text-2xl font-bold text-slate-900">Students</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowAdminRegister(true)} className="btn btn-outline">
            <UserPlus className="h-4 w-4" /> Register Student + Parent
          </button>
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            <Plus className="h-4 w-4" /> Add Student
          </button>
        </div>
      </div>

      <select value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)} className="input">
        <option value="">All Grades</option>
        {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
      </select>

      <Modal open={showForm} onClose={closeForm} title={editingId ? 'Edit Student' : 'New Student'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!editingId && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700">Student Number</label>
                <input value={studentNum} onChange={(e) => setStudentNum(e.target.value)} required className="input mt-1" />
              </div>
              <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
                <p className="mb-2 text-sm font-semibold text-primary-700">Father (required)</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p1First} onChange={(e) => setP1First(e.target.value)} required placeholder="First name" className="input" />
                    <input value={p1Last} onChange={(e) => setP1Last(e.target.value)} required placeholder="Last name" className="input" />
                  </div>
                  <input value={p1Id} onChange={(e) => setP1Id(e.target.value)} placeholder="ID Number (optional)" className="input" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p1Phone} onChange={(e) => setP1Phone(e.target.value)} placeholder="Phone" className="input" />
                    <input value={p1Email} onChange={(e) => setP1Email(e.target.value)} type="email" placeholder="Email" className="input" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p1Address} onChange={(e) => setP1Address(e.target.value)} placeholder="Physical address" className="input" />
                    <input value={p1PoBox} onChange={(e) => setP1PoBox(e.target.value)} placeholder="PO Box" className="input" />
                  </div>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-sm font-semibold text-slate-700">Mother (optional)</p>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p2First} onChange={(e) => setP2First(e.target.value)} placeholder="First name" className="input" />
                    <input value={p2Last} onChange={(e) => setP2Last(e.target.value)} placeholder="Last name" className="input" />
                  </div>
                  <input value={p2Id} onChange={(e) => setP2Id(e.target.value)} placeholder="ID Number (optional)" className="input" />
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p2Phone} onChange={(e) => setP2Phone(e.target.value)} placeholder="Phone" className="input" />
                    <input value={p2Email} onChange={(e) => setP2Email(e.target.value)} type="email" placeholder="Email" className="input" />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input value={p2Address} onChange={(e) => setP2Address(e.target.value)} placeholder="Physical address" className="input" />
                    <input value={p2PoBox} onChange={(e) => setP2PoBox(e.target.value)} placeholder="PO Box" className="input" />
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">First Name</label>
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="input mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Last Name</label>
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} required className="input mt-1" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Grade</label>
            <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} required className="input mt-1">
              <option value="">Select</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          {!editingId && (
            <div>
              <label className="block text-sm font-medium text-slate-700">Enrollment Date</label>
              <input type="date" value={enrollDate} onChange={(e) => setEnrollDate(e.target.value)} required className="input mt-1" />
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Saving...' : editingId ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={closeForm} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </Modal>

      <Modal open={showAdminRegister} onClose={closeAdminRegister} title="Register Student + Parent">
        {adminRegisterResult ? (
          <div className="space-y-4">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-sm font-semibold text-emerald-800">
                {adminRegisterResult.student.first_name} {adminRegisterResult.student.last_name} registered
              </p>
              <p className="mt-1 text-sm text-emerald-700">
                Student number: <span className="font-mono font-medium">{adminRegisterResult.student.student_number}</span>
              </p>
              <p className="text-sm text-emerald-700">
                Parent account: <span className="font-medium">{adminRegisterResult.parent.email}</span>
                {!adminRegisterResult.temporary_password && (
                  <span className="ml-2 badge badge-success">Existing account linked</span>
                )}
              </p>
            </div>
            {adminRegisterResult.temporary_password ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-800">
                  Temporary password — shown ONCE, give it to the parent now
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 rounded bg-white border border-amber-200 px-3 py-2 font-mono text-sm text-slate-800">
                    {adminRegisterResult.temporary_password}
                  </code>
                  <button onClick={copyCredentials} className="btn btn-outline" title="Copy credentials">
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-2 text-xs text-amber-700">
                  The parent signs in with {adminRegisterResult.parent.email} and this password, then changes it in
                  their profile.
                </p>
              </div>
            ) : (
              <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                The email <span className="font-medium">{adminRegisterResult.parent.email}</span> was already a portal
                account, so the student was linked to it — no new password was created.
              </p>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={closeAdminRegister} className="btn btn-primary">Done</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleAdminRegister} className="space-y-4">
            <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
              <p className="mb-2 text-sm font-semibold text-primary-700">Child</p>
              <div className="grid grid-cols-2 gap-2">
                <input value={arFirstName} onChange={(e) => setArFirstName(e.target.value)} required placeholder="First name" className="input" />
                <input value={arLastName} onChange={(e) => setArLastName(e.target.value)} required placeholder="Last name" className="input" />
              </div>
              <select value={arGradeId} onChange={(e) => setArGradeId(e.target.value)} required className="input mt-2">
                <option value="">Select grade</option>
                {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>

            <div className="rounded-lg border border-primary-200 bg-primary-50 p-3">
              <p className="mb-2 text-sm font-semibold text-primary-700">
                Parent portal account <span className="font-normal text-primary-500">(email is the login)</span>
              </p>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input value={arParentName} onChange={(e) => setArParentName(e.target.value)} required placeholder="Parent full name" className="input" />
                  <select value={arRelationship} onChange={(e) => setArRelationship(e.target.value as 'father' | 'mother')} className="input">
                    <option value="father">Father</option>
                    <option value="mother">Mother</option>
                  </select>
                </div>
                <input value={arParentEmail} onChange={(e) => setArParentEmail(e.target.value)} type="email" required placeholder="Email (login)" className="input" />
                <input value={arGuardianId} onChange={(e) => setArGuardianId(e.target.value)} placeholder="ID Number (optional)" className="input" />
                <div className="grid grid-cols-2 gap-2">
                  <input value={arPhone} onChange={(e) => setArPhone(e.target.value)} placeholder="Phone" className="input" />
                  <input value={arPoBox} onChange={(e) => setArPoBox(e.target.value)} placeholder="PO Box" className="input" />
                </div>
                <input value={arAddress} onChange={(e) => setArAddress(e.target.value)} placeholder="Physical address" className="input" />
              </div>
            </div>

            <details className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <summary className="text-sm font-semibold text-slate-700">Other parent (optional)</summary>
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <input value={arOtherFirst} onChange={(e) => setArOtherFirst(e.target.value)} placeholder="First name" className="input" />
                  <input value={arOtherLast} onChange={(e) => setArOtherLast(e.target.value)} placeholder="Last name" className="input" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input value={arOtherPhone} onChange={(e) => setArOtherPhone(e.target.value)} placeholder="Phone" className="input" />
                  <input value={arOtherEmail} onChange={(e) => setArOtherEmail(e.target.value)} type="email" placeholder="Email" className="input" />
                </div>
              </div>
            </details>

            <div className="flex gap-2 pt-2">
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Registering...' : 'Register'}
              </button>
              <button type="button" onClick={closeAdminRegister} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        )}
      </Modal>

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Number</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Grade</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Parents</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr><td colSpan={6} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" /></td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-slate-500">No students found.</td></tr>
            ) : students.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm font-mono text-slate-700">{s.student_number}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{s.first_name} {s.last_name}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{grades.find((g) => g.id === s.grade_id)?.name || s.grade_id}</td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-700">
                    {s.guardians?.map((g) => (
                      <div key={g.id} className="flex items-center gap-1">
                        <span className="text-slate-400">{g.guardian_type === 'mother' || g.guardian_type === 'secondary' ? 'Mo' : 'Fa'}</span>
                        <span>{g.full_name}</span>
                      </div>
                    ))}
                    {(!s.guardians || s.guardians.length === 0) && <span className="text-slate-400">-</span>}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`badge ${s.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => handleEdit(s)} className="rounded p-1 text-slate-400 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDeactivate(s.id)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Deactivate"><UserX className="h-4 w-4" /></button>
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
