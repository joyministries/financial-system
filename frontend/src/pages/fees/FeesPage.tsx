import { useEffect, useState } from 'react';
import { feesApi, gradesApi } from '@/api/client';
import type { Grade, FeeStructure } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Settings, Loader2, Pencil } from 'lucide-react';
import Modal from '@/components/Modal';

const CATEGORIES = ['Tuition', 'Uniform', 'Books', 'Transport', 'Boarding', 'Laboratory', 'Examination'];

export default function FeesPage() {
  const [grades, setGrades] = useState<Grade[]>([]);
  const [selectedGrade, setSelectedGrade] = useState('');
  const [year, setYear] = useState(new Date().getFullYear());
  const [fees, setFees] = useState<FeeStructure[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [category, setCategory] = useState('Tuition');
  const [annual, setAnnual] = useState('');
  const [paymentPlan, setPaymentPlan] = useState<'monthly' | 'yearly'>('monthly');
  const [monthly, setMonthly] = useState('');

  // Edit form state
  const [editingFee, setEditingFee] = useState<FeeStructure | null>(null);
  const [editAnnual, setEditAnnual] = useState('');
  const [editMonthly, setEditMonthly] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);

  useEffect(() => { gradesApi.list().then((r) => setGrades(r.data)); }, []);

  useEffect(() => {
    if (selectedGrade) {
      setLoading(true);
      feesApi.listByGrade(selectedGrade, year).then((r) => setFees(r.data)).finally(() => setLoading(false));
    }
  }, [selectedGrade, year]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGrade) return toast.error('Select a grade first');
    setSubmitting(true);
    try {
      await feesApi.create(selectedGrade, {
        academic_year: year,
        category,
        annual_amount: annual,
        payment_plan: paymentPlan,
        monthly_installment: paymentPlan === 'monthly' ? monthly : null,
      });
      toast.success('Fee structure created');
      closeForm();
      feesApi.listByGrade(selectedGrade, year).then((r) => setFees(r.data));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to create');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingFee) return;
    if (!editAnnual || parseFloat(editAnnual) <= 0) return toast.error('Annual amount must be greater than 0');
    setEditSubmitting(true);
    try {
      await feesApi.update(editingFee.id, {
        annual_amount: parseFloat(editAnnual),
        monthly_installment: editingFee.payment_plan === 'monthly' ? (editMonthly ? parseFloat(editMonthly) : null) : null,
      });
      toast.success('Fee updated — parents will see the new amount');
      setEditingFee(null);
      feesApi.listByGrade(selectedGrade, year).then((r) => setFees(r.data));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to update fee');
    } finally {
      setEditSubmitting(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setCategory('Tuition');
    setAnnual('');
    setPaymentPlan('monthly');
    setMonthly('');
  };

  const openEdit = (fee: FeeStructure) => {
    setEditingFee(fee);
    setEditAnnual(String(fee.annual_amount));
    setEditMonthly(fee.monthly_installment ? String(fee.monthly_installment) : '');
  };

  const handleGenerateSchedule = async (feeId: string) => {
    try {
      await feesApi.generateSchedule(feeId);
      toast.success('Monthly schedule generated');
    } catch {
      toast.error('Failed to generate');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-ink">Fee Structures</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          <Plus className="h-4 w-4" /> Add Fee
        </button>
      </div>

      <div className="flex gap-4">
        <select value={selectedGrade} onChange={(e) => setSelectedGrade(e.target.value)} className="input">
          <option value="">Select Grade</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="number" value={year} onChange={(e) => setYear(parseInt(e.target.value))} className="w-32 input" />
      </div>

      {/* Create Form Modal */}
      <Modal open={showForm} onClose={closeForm} title="New Fee Structure">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-body">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-1">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Annual Amount (R)</label>
            <input type="number" step="0.01" min="0.01" value={annual} onChange={(e) => setAnnual(e.target.value)} required className="input mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Payment Plan</label>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setPaymentPlan('monthly')} className={`rounded-lg px-3 py-2 text-sm font-medium ${paymentPlan === 'monthly' ? 'bg-primary-900 text-white' : 'border border-[#d8d2c4] text-body hover:bg-[#fdfbf5]'}`}>
                Monthly installments
              </button>
              <button type="button" onClick={() => setPaymentPlan('yearly')} className={`rounded-lg px-3 py-2 text-sm font-medium ${paymentPlan === 'yearly' ? 'bg-primary-900 text-white' : 'border border-[#d8d2c4] text-body hover:bg-[#fdfbf5]'}`}>
                Pay yearly (lump sum)
              </button>
            </div>
          </div>
          {paymentPlan === 'monthly' ? (
            <div>
              <label className="block text-sm font-medium text-body">Monthly Installment (R)</label>
              <input type="number" step="0.01" min="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} required className="input mt-1" />
            </div>
          ) : (
            <p className="rounded-lg bg-[#eef6f1] px-3 py-2 text-xs text-[#1c7a4f]">
              Yearly plan — parents pay the full annual amount once (single schedule in January).
            </p>
          )}
          <div className="flex gap-2 pt-2">
            <button type="submit" disabled={submitting} className="btn btn-primary">
              {submitting ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={closeForm} className="btn btn-secondary">Cancel</button>
          </div>
        </form>
      </Modal>

      {/* Edit Fee Modal */}
      <Modal open={!!editingFee} onClose={() => setEditingFee(null)} title={`Edit ${editingFee?.category} Fee`}>
        {editingFee && (
          <div className="space-y-4">
            <p className="text-sm text-muted">
              Changing this fee applies to <strong>all students</strong> in this grade for the {year} academic year.
              Per-student discounts will continue to apply on top of the new amount.
            </p>
            <div>
              <label className="block text-sm font-medium text-body">Annual Amount (R)</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={editAnnual}
                onChange={(e) => setEditAnnual(e.target.value)}
                className="input mt-1"
              />
            </div>
            {editingFee.payment_plan === 'monthly' && (
              <div>
                <label className="block text-sm font-medium text-body">Monthly Installment (R)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={editMonthly}
                  onChange={(e) => setEditMonthly(e.target.value)}
                  className="input mt-1"
                />
              </div>
            )}
            <div className="rounded-lg bg-[#fbf4e2] px-3 py-2 text-xs text-[#8a6f13]">
              All parents viewing their fee breakdown will immediately see the updated amount.
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={handleUpdate} disabled={editSubmitting} className="btn btn-primary">
                {editSubmitting ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditingFee(null)} className="btn btn-secondary">Cancel</button>
            </div>
          </div>
        )}
      </Modal>

      <div className="rounded-xl bg-white shadow-sm border border-line-soft overflow-x-auto">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-faint" /></div>
        ) : (
          <>
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-[#faf8f2]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Plan</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Annual</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Monthly</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {fees.map((f) => (
                  <tr key={f.id} className="hover:bg-[#fdfbf5]">
                    <td className="px-6 py-4 text-sm font-medium text-ink">{f.category}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${f.payment_plan === 'yearly' ? 'badge badge-info' : 'bg-purple-100 text-purple-700'}`}>
                        {f.payment_plan === 'yearly' ? 'Yearly' : 'Monthly'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-body">R {Number(f.annual_amount).toLocaleString()}</td>
                    <td className="px-6 py-4 text-sm text-body">{f.monthly_installment ? `R ${Number(f.monthly_installment).toLocaleString()}` : <span className="text-faint">Lump sum</span>}</td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openEdit(f)} className="rounded-lg bg-[#f4f6f9] px-3 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100">
                          <Pencil className="mr-1 inline h-3 w-3" /> Edit
                        </button>
                        <button onClick={() => handleGenerateSchedule(f.id)} className="rounded-lg bg-[#eef6f1] px-3 py-1 text-xs font-medium text-[#1c7a4f] hover:bg-[#e3f0e8]">
                          <Settings className="mr-1 inline h-3 w-3" /> Generate Schedule
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fees.length === 0 && <p className="py-8 text-center text-sm text-muted">{selectedGrade ? 'No fees for this grade/year.' : 'Select a grade to view fees.'}</p>}
          </>
        )}
      </div>
    </div>
  );
}
