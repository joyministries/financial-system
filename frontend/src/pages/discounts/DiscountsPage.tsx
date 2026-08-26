import { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  discountsApi,
  feesApi,
  gradesApi,
  studentsApi,
  type FeeOverride,
} from '@/api/client';
import type { FeeStructure, Grade, Student } from '@/types';
import { Percent, Trash2, Plus, Users, Loader2, Search, X } from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();
const money = (n: number) =>
  `R ${Number(n || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DiscountsPage() {
  // Data
  const [overrides, setOverrides] = useState<FeeOverride[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [feesByGrade, setFeesByGrade] = useState<Record<string, FeeStructure[]>>({});

  // Filters
  const [search, setSearch] = useState('');

  // Single discount form
  const [showForm, setShowForm] = useState(false);
  const [formStudentId, setFormStudentId] = useState('');
  const [formFeeId, setFormFeeId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formType, setFormType] = useState<'override' | 'percent'>('percent');
  const [formReason, setFormReason] = useState('');
  const [formLoading, setFormLoading] = useState(false);

  // Bulk discount form
  const [showBulk, setShowBulk] = useState(false);
  const [bulkGradeId, setBulkGradeId] = useState('');
  const [bulkFeeId, setBulkFeeId] = useState('');
  const [bulkAmount, setBulkAmount] = useState('');
  const [bulkType, setBulkType] = useState<'override' | 'percent'>('percent');
  const [bulkReason, setBulkReason] = useState('');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set());
  const [bulkSelectAll, setBulkSelectAll] = useState(false);

  // Load data
  const loadData = useCallback(async () => {
    try {
      const [gradesRes, overridesRes, studentsRes] = await Promise.all([
        gradesApi.list(),
        discountsApi.list(),
        studentsApi.list({ limit: 200, offset: 0 }),
      ]);
      setGrades(gradesRes.data.filter(g => g.is_active && !g.is_archived));
      setOverrides(overridesRes.data);
      setStudents(studentsRes.data?.items || []);
    } catch {
      toast.error('Failed to load data');
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Load fees when bulk grade changes
  useEffect(() => {
    if (!bulkGradeId) return;
    if (feesByGrade[bulkGradeId]) return;
    feesApi.listByGrade(bulkGradeId, CURRENT_YEAR)
      .then(res => setFeesByGrade(prev => ({ ...prev, [bulkGradeId]: res.data })))
      .catch(() => {});
  }, [bulkGradeId, feesByGrade]);

  // Load fees for single form grade
  const selectedStudent = students.find(s => s.id === formStudentId);
  const selectedGradeId = selectedStudent?.grade_id || '';
  useEffect(() => {
    if (!selectedGradeId) return;
    if (feesByGrade[selectedGradeId]) return;
    feesApi.listByGrade(selectedGradeId, CURRENT_YEAR)
      .then(res => setFeesByGrade(prev => ({ ...prev, [selectedGradeId]: res.data })))
      .catch(() => {});
  }, [selectedGradeId, feesByGrade]);

  // Bulk students filtered by grade
  const bulkStudents = bulkGradeId
    ? students.filter(s => s.grade_id === bulkGradeId && s.is_active && s.registration_status === 'approved')
    : students.filter(s => s.is_active && s.registration_status === 'approved');

  // Filtered overrides
  const filteredOverrides = overrides.filter(o => {
    if (search) {
      const student = students.find(s => s.id === o.student_id);
      if (student) {
        const name = `${student.first_name} ${student.last_name}`.toLowerCase();
        const num = student.student_number?.toLowerCase() || '';
        if (!name.includes(search.toLowerCase()) && !num.includes(search.toLowerCase())) return false;
      }
    }
    return true;
  });

  // Create single discount
  const handleCreate = async () => {
    if (!formStudentId || !formFeeId || !formAmount) {
      toast.error('Fill in all required fields');
      return;
    }
    setFormLoading(true);
    try {
      await discountsApi.create({
        student_id: formStudentId,
        fee_structure_id: formFeeId,
        annual_amount: parseFloat(formAmount),
        discount_type: formType,
        reason: formReason || undefined,
      });
      toast.success('Discount applied');
      setShowForm(false);
      resetForm();
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create discount');
    } finally {
      setFormLoading(false);
    }
  };

  // Create bulk discounts
  const handleBulk = async () => {
    if (!bulkFeeId || !bulkAmount || bulkSelected.size === 0) {
      toast.error('Select students and fill in discount details');
      return;
    }
    setBulkLoading(true);
    try {
      const res = await discountsApi.bulk({
        student_ids: Array.from(bulkSelected),
        fee_structure_id: bulkFeeId,
        annual_amount: parseFloat(bulkAmount),
        discount_type: bulkType,
        reason: bulkReason || undefined,
      });
      const count = res.data.length;
      toast.success(`Discount applied to ${count} student${count !== 1 ? 's' : ''}`);
      setShowBulk(false);
      resetBulk();
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to apply bulk discount');
    } finally {
      setBulkLoading(false);
    }
  };

  // Delete discount
  const handleDelete = async (id: string) => {
    if (!confirm('Remove this discount?')) return;
    try {
      await discountsApi.remove(id);
      toast.success('Discount removed');
      loadData();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to remove discount');
    }
  };

  const resetForm = () => {
    setFormStudentId('');
    setFormFeeId('');
    setFormAmount('');
    setFormType('percent');
    setFormReason('');
  };

  const resetBulk = () => {
    setBulkGradeId('');
    setBulkFeeId('');
    setBulkAmount('');
    setBulkType('percent');
    setBulkReason('');
    setBulkSelected(new Set());
    setBulkSelectAll(false);
  };

  const toggleBulkStudent = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleBulkSelectAll = () => {
    if (bulkSelectAll) {
      setBulkSelected(new Set());
    } else {
      setBulkSelected(new Set(bulkStudents.map(s => s.id)));
    }
    setBulkSelectAll(!bulkSelectAll);
  };

  const getStudentName = (id: string) => {
    const s = students.find(st => st.id === id);
    return s ? `${s.first_name} ${s.last_name}` : id.slice(0, 8);
  };

  const getStudentGrade = (id: string) => {
    const s = students.find(st => st.id === id);
    return grades.find(g => g.id === s?.grade_id)?.name || '';
  };

  const getFeeLabel = (id: string) => {
    for (const fees of Object.values(feesByGrade)) {
      const f = fees.find(fee => fee.id === id);
      if (f) return `${f.category} (${money(Number(f.annual_amount))}/yr)`;
    }
    return id.slice(0, 8);
  };

  const feesForBulk = bulkGradeId ? (feesByGrade[bulkGradeId] || []) : [];
  const feesForSingle = selectedGradeId ? (feesByGrade[selectedGradeId] || []) : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Discounts</h1>
          <p className="text-sm text-slate-500">Manage per-student fee discounts and bulk overrides</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setShowForm(true); setShowBulk(false); }}
            className="btn btn-outline flex items-center gap-2"
          >
            <Plus className="h-4 w-4" />
            Single Discount
          </button>
          <button
            onClick={() => { setShowBulk(true); setShowForm(false); }}
            className="btn btn-primary flex items-center gap-2"
          >
            <Users className="h-4 w-4" />
            Bulk Discount
          </button>
        </div>
      </div>

      {/* Single Discount Form */}
      {showForm && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Apply Discount to Student</h2>
            <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700">Student *</label>
              <select value={formStudentId} onChange={e => { setFormStudentId(e.target.value); setFormFeeId(''); }} className="input mt-1">
                <option value="">Select student...</option>
                {students.filter(s => s.is_active && s.registration_status === 'approved').map(s => (
                  <option key={s.id} value={s.id}>{s.first_name} {s.last_name} ({s.student_number})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Fee Structure *</label>
              <select value={formFeeId} onChange={e => setFormFeeId(e.target.value)} className="input mt-1" disabled={!selectedGradeId}>
                <option value="">{selectedGradeId ? 'Select fee...' : 'Select a student first'}</option>
                {feesForSingle.map(f => (
                  <option key={f.id} value={f.id}>{f.category} — {money(Number(f.annual_amount))}/yr</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Discount Type *</label>
              <select value={formType} onChange={e => setFormType(e.target.value as any)} className="input mt-1">
                <option value="percent">Percentage Discount (%)</option>
                <option value="override">Fixed Amount Override (R)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">
                {formType === 'percent' ? 'Discount Percentage *' : 'Override Amount (R) *'}
              </label>
              <input
                type="number"
                min="0"
                max={formType === 'percent' ? '100' : undefined}
                step={formType === 'percent' ? '1' : '0.01'}
                value={formAmount}
                onChange={e => setFormAmount(e.target.value)}
                className="input mt-1"
                placeholder={formType === 'percent' ? 'e.g. 10 for 10% off' : 'e.g. 5000'}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700">Reason</label>
              <input
                type="text"
                value={formReason}
                onChange={e => setFormReason(e.target.value)}
                className="input mt-1"
                placeholder="e.g. Sibling discount, Bursary, etc."
              />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setShowForm(false); resetForm(); }} className="btn btn-outline">Cancel</button>
            <button onClick={handleCreate} disabled={formLoading} className="btn btn-primary flex items-center gap-2">
              {formLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply Discount
            </button>
          </div>
        </div>
      )}

      {/* Bulk Discount Form */}
      {showBulk && (
        <div className="rounded-2xl border border-primary-200 bg-primary-50/30 p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Bulk Discount — Apply to Multiple Students</h2>
            <button onClick={() => { setShowBulk(false); resetBulk(); }} className="text-slate-400 hover:text-slate-600">
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700">Filter by Grade</label>
              <select value={bulkGradeId} onChange={e => { setBulkGradeId(e.target.value); setBulkFeeId(''); setBulkSelected(new Set()); setBulkSelectAll(false); }} className="input mt-1">
                <option value="">All grades</option>
                {grades.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Fee Structure *</label>
              <select value={bulkFeeId} onChange={e => setBulkFeeId(e.target.value)} className="input mt-1" disabled={!bulkGradeId}>
                <option value="">{bulkGradeId ? 'Select fee...' : 'Select a grade first'}</option>
                {feesForBulk.map(f => (
                  <option key={f.id} value={f.id}>{f.category} — {money(Number(f.annual_amount))}/yr</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-slate-700">Type *</label>
                <select value={bulkType} onChange={e => setBulkType(e.target.value as any)} className="input mt-1">
                  <option value="percent">% Discount</option>
                  <option value="override">R Override</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Amount *</label>
                <input
                  type="number"
                  min="0"
                  max={bulkType === 'percent' ? '100' : undefined}
                  step={bulkType === 'percent' ? '1' : '0.01'}
                  value={bulkAmount}
                  onChange={e => setBulkAmount(e.target.value)}
                  className="input mt-1"
                  placeholder={bulkType === 'percent' ? '% off' : 'R amount'}
                />
              </div>
            </div>
            <div className="sm:col-span-3">
              <label className="block text-sm font-medium text-slate-700">Reason</label>
              <input
                type="text"
                value={bulkReason}
                onChange={e => setBulkReason(e.target.value)}
                className="input mt-1"
                placeholder="e.g. Group bursary, Sibling discount"
              />
            </div>
          </div>

          {/* Student selection */}
          <div className="mt-4 rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <span className="text-sm font-medium text-slate-700">
                Select Students ({bulkSelected.size} of {bulkStudents.length} selected)
              </span>
              <button onClick={toggleBulkSelectAll} className="text-sm font-medium text-primary-600 hover:text-primary-700">
                {bulkSelectAll ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-60 overflow-y-auto">
              {bulkStudents.map(s => {
                const gradeName = grades.find(g => g.id === s.grade_id)?.name || '';
                return (
                  <label
                    key={s.id}
                    className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-2.5 hover:bg-slate-50 last:border-b-0"
                  >
                    <input
                      type="checkbox"
                      checked={bulkSelected.has(s.id)}
                      onChange={() => toggleBulkStudent(s.id)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-900">{s.first_name} {s.last_name}</p>
                      <p className="text-xs text-slate-500">{s.student_number} · {gradeName}</p>
                    </div>
                  </label>
                );
              })}
              {bulkStudents.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-400">No students found</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => { setShowBulk(false); resetBulk(); }} className="btn btn-outline">Cancel</button>
            <button
              onClick={handleBulk}
              disabled={bulkLoading || bulkSelected.size === 0}
              className="btn btn-primary flex items-center gap-2"
            >
              {bulkLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              Apply to {bulkSelected.size} Student{bulkSelected.size !== 1 ? 's' : ''}
            </button>
          </div>
        </div>
      )}

      {/* Existing Overrides Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Active Discounts ({filteredOverrides.length})</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by student name..."
              className="input pl-9 py-2 text-sm w-64"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                <th className="px-6 py-3">Student</th>
                <th className="px-6 py-3">Grade</th>
                <th className="px-6 py-3">Fee Structure</th>
                <th className="px-6 py-3">Discount</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3">Reason</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredOverrides.map(o => (
                <tr key={o.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-6 py-3 font-medium text-slate-900">{getStudentName(o.student_id)}</td>
                  <td className="px-6 py-3 text-slate-600">{getStudentGrade(o.student_id)}</td>
                  <td className="px-6 py-3 text-slate-600">{getFeeLabel(o.fee_structure_id)}</td>
                  <td className="px-6 py-3 font-semibold text-slate-900">
                    {o.discount_type === 'percent' ? `${o.annual_amount}%` : money(o.annual_amount)}
                  </td>
                  <td className="px-6 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      o.discount_type === 'percent'
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-green-50 text-green-700'
                    }`}>
                      {o.discount_type === 'percent' ? (
                        <><Percent className="mr-0.5 h-3 w-3" /> Percent</>
                      ) : (
                        'Override'
                      )}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-500 max-w-[200px] truncate">{o.reason || '—'}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      onClick={() => handleDelete(o.id)}
                      className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      title="Remove discount"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOverrides.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-slate-400">
                    <Percent className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                    <p className="font-medium">No discounts configured</p>
                    <p className="mt-1 text-sm">Click "Single Discount" or "Bulk Discount" to get started</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
