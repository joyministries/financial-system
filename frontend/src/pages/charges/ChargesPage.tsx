import { useEffect, useState } from 'react';
import { chargesApi, studentsApi, gradesApi } from '@/api/client';
import type { AdditionalCharge, Student, Grade } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';
import StudentSearchSelect from '@/components/StudentSearchSelect';

const CHARGE_TYPES = ['Excursions', 'School Trips', 'Concerts', 'Uniform', 'Books', 'Sports Fees', 'Registration Fees'];
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const PAGE_SIZE = 50;

export default function ChargesPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [filterGradeId, setFilterGradeId] = useState('');
  const [selectedStudent, setSelectedStudent] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [charges, setCharges] = useState<AdditionalCharge[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);

  // Form state
  const [scope, setScope] = useState<'grade' | 'student'>('grade');
  const [gradeId, setGradeId] = useState('');
  const [optOutIds, setOptOutIds] = useState<Set<string>>(new Set());
  const [chargeType, setChargeType] = useState('Excursions');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);

  useEffect(() => { studentsApi.list().then((r) => setStudents(r.data)); }, []);
  useEffect(() => { gradesApi.list().then((r) => setGrades(r.data)); }, []);

  useEffect(() => {
    if (selectedStudent) {
      setLoading(true);
      setPage(1);
      chargesApi.list(selectedStudent, year).then((r) => setCharges(r.data)).finally(() => setLoading(false));
    } else {
      setCharges([]);
    }
  }, [selectedStudent, year]);

  const pagedCharges = charges.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Students in a grade (grade-first dropdowns: pick a grade, then a student in it).
  const studentsInGrade = (grade: string) =>
    grade ? students.filter((s) => s.grade_id === grade) : [];

  // Students in the selected grade (used for bulk charge + opt-out checkboxes)
  const gradeStudents = gradeId ? studentsInGrade(gradeId) : [];

  const toggleOptOut = (id: string) => {
    setOptOutIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setOptOutIds(new Set());
  const selectNone = () => setOptOutIds(new Set(gradeStudents.map((s) => s.id)));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (scope === 'grade') {
        if (!gradeId) return toast.error('Select a grade');
        if (gradeStudents.length === optOutIds.size) return toast.error('All students opted out — nothing to charge');
        const res = await chargesApi.createForGrade({
          grade_id: gradeId,
          charge_type: chargeType,
          description,
          amount,
          academic_year: year,
          month,
          exclude_student_ids: Array.from(optOutIds),
        });
        toast.success(`Additional charge applied to ${res.data.length} student${res.data.length === 1 ? '' : 's'}`);
      } else {
        if (!selectedStudent) return toast.error('Select a student');
        await chargesApi.create({
          student_id: selectedStudent,
          charge_type: chargeType,
          description,
          amount,
          academic_year: year,
          month,
        });
        toast.success('Additional charge added');
      }
      closeForm();
      if (selectedStudent) chargesApi.list(selectedStudent, year).then((r) => setCharges(r.data));
    } catch {
      toast.error('Failed to add charge');
    } finally {
      setSubmitting(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setScope('grade');
    setGradeId('');
    setOptOutIds(new Set());
    setChargeType('Excursions');
    setDescription('');
    setAmount('');
    setMonth(new Date().getMonth() + 1);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this additional charge?')) return;
    await chargesApi.delete(id);
    toast.success('Additional charge deleted');
    if (selectedStudent) chargesApi.list(selectedStudent, year).then((r) => setCharges(r.data));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Additional Charges</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <Plus className="h-4 w-4" /> Add Additional Charge
        </button>
      </div>

      <div className="flex gap-4">
        <select
          value={filterGradeId}
          onChange={(e) => { setFilterGradeId(e.target.value); setSelectedStudent(''); }}
          className="input"
        >
          <option value="">All Grades</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <StudentSearchSelect
          value={selectedStudent}
          onChange={setSelectedStudent}
          placeholder="Search student by name or number…"
        />
        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-32 input" />
      </div>

      <Modal open={showForm} onClose={closeForm} title="New Additional Charge">
        <form onSubmit={handleCreate} className="space-y-4">
          {/* Scope */}
          <div>
            <label className="block text-sm font-medium text-slate-700">Apply to</label>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setScope('grade')} className={`rounded-lg px-3 py-2 text-sm font-medium ${scope === 'grade' ? 'bg-primary-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                Whole Grade
              </button>
              <button type="button" onClick={() => setScope('student')} className={`rounded-lg px-3 py-2 text-sm font-medium ${scope === 'student' ? 'bg-primary-600 text-white' : 'border border-slate-300 text-slate-700 hover:bg-slate-50'}`}>
                Single Student
              </button>
            </div>
          </div>

          {scope === 'grade' ? (
            <div>
              <label className="block text-sm font-medium text-slate-700">Grade</label>
              <select value={gradeId} onChange={(e) => { setGradeId(e.target.value); setOptOutIds(new Set()); }} required className="input mt-1">
                <option value="">Select Grade</option>
                {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              {gradeId && gradeStudents.length > 0 && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-600">
                      {gradeStudents.length - optOutIds.size} of {gradeStudents.length} students charged
                    </span>
                    <div className="flex gap-2 text-xs">
                      <button type="button" onClick={selectAll} className="text-primary-600 hover:underline">All</button>
                      <button type="button" onClick={selectNone} className="text-red-500 hover:underline">None</button>
                    </div>
                  </div>
                  <p className="mb-2 text-xs text-slate-500">Uncheck a student to opt them out (e.g. not attending the excursion).</p>
                  <div className="max-h-40 space-y-1 overflow-y-auto">
                    {gradeStudents.map((s) => (
                      <label key={s.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-100">
                        <input
                          type="checkbox"
                          checked={!optOutIds.has(s.id)}
                          onChange={() => toggleOptOut(s.id)}
                          className="h-4 w-4 rounded border-slate-300 text-primary-600"
                        />
                        {s.first_name} {s.last_name}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700">Grade</label>
                <select
                  value={gradeId}
                  onChange={(e) => { setGradeId(e.target.value); setSelectedStudent(''); }}
                  className="input mt-1"
                >
                  <option value="">Select Grade</option>
                  {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Student</label>
                <StudentSearchSelect
                  value={selectedStudent}
                  onChange={setSelectedStudent}
                  placeholder="Search student by name or number…"
                />
                {!gradeId && <p className="mt-1 text-xs text-slate-500">Pick a grade first to see its students.</p>}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700">Type</label>
            <select value={chargeType} onChange={(e) => setChargeType(e.target.value)} className="input mt-1">
              {CHARGE_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700">Description</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} required className="input mt-1" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Amount (R)</label>
              <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required className="input mt-1" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Month</label>
              <select value={month} onChange={(e) => setMonth(parseInt(e.target.value))} className="input mt-1">
                {MONTHS.map((m) => (
                  <option key={m} value={m}>{new Date(2024, m - 1).toLocaleString('default', { month: 'long' })}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Adding...' : 'Add Charge'}
            </button>
            <button type="button" onClick={closeForm} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </Modal>

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-hidden">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Month</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {pagedCharges.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">{c.charge_type}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{c.description}</td>
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">R {Number(c.amount).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-slate-500">{new Date(2024, c.month - 1).toLocaleString('default', { month: 'long' })}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${c.is_paid ? 'badge badge-success' : 'bg-yellow-100 text-yellow-700'}`}>
                        {c.is_paid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button onClick={() => handleDelete(c.id)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Delete"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {charges.length === 0 && <p className="py-8 text-center text-sm text-slate-500">{selectedStudent ? 'No additional charges.' : 'Select a student.'}</p>}
            {charges.length > PAGE_SIZE && (
              <Pagination
                page={page}
                totalPages={Math.ceil(charges.length / PAGE_SIZE)}
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
