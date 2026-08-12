import { useEffect, useState } from 'react';
import { feesApi, gradesApi } from '@/api/client';
import type { Grade, FeeStructure } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Settings, Loader2 } from 'lucide-react';
import Modal from '@/components/Modal';

// Registration is now configured as a single super-admin setting
// (Settings → Registration Fee), not a per-grade fee structure.
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

  const closeForm = () => {
    setShowForm(false);
    setCategory('Tuition');
    setAnnual('');
    setPaymentPlan('monthly');
    setMonthly('');
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
        <h1 className="page-title">Fee Structures</h1>
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

      <Modal open={showForm} onClose={closeForm} title="New Fee Structure">
        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="label">Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className="input mt-1">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Annual Amount (R)</label>
            <input type="number" step="0.01" min="0.01" value={annual} onChange={(e) => setAnnual(e.target.value)} required className="input mt-1" />
          </div>
          <div>
            <label className="label">Payment Plan</label>
            <div className="mt-1 flex gap-2">
              <button type="button" onClick={() => setPaymentPlan('monthly')} className={`rounded-lg px-3 py-2 text-sm font-medium ${paymentPlan === 'monthly' ? 'bg-primary-600 text-white' : 'border border-ledger-border text-ledger-ink hover:bg-ledger-bg'}`}>
                Monthly installments
              </button>
              <button type="button" onClick={() => setPaymentPlan('yearly')} className={`rounded-lg px-3 py-2 text-sm font-medium ${paymentPlan === 'yearly' ? 'bg-primary-600 text-white' : 'border border-ledger-border text-ledger-ink hover:bg-ledger-bg'}`}>
                Pay yearly (lump sum)
              </button>
            </div>
          </div>
          {paymentPlan === 'monthly' ? (
            <div>
              <label className="label">Monthly Installment (R)</label>
              <input type="number" step="0.01" min="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} required className="input mt-1" />
            </div>
          ) : (
            <p className="rounded-lg border border-ledger-border bg-ledger-bg px-3 py-2 text-xs text-ledger-muted">
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

      <div className="table-wrap">
        {loading ? (
          <div className="flex h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-ledger-muted" /></div>
        ) : (
          <>
            <table className="ledger-table">
              <thead className="bg-ledger-bg">
                <tr>
                  <th className="th">Category</th>
                  <th className="th">Plan</th>
                  <th className="th">Annual</th>
                  <th className="th">Monthly</th>
                  <th className="th th-num">Actions</th>
                </tr>
              </thead>
              <tbody className="">
                {fees.map((f) => (
                  <tr key={f.id} className="hover:bg-ledger-bg">
                    <td className="td font-medium">{f.category}</td>
                    <td className="td">
                      <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${f.payment_plan === 'yearly' ? 'badge badge-info' : 'badge badge-info'}`}>
                        {f.payment_plan === 'yearly' ? 'Yearly' : 'Monthly'}
                      </span>
                    </td>
                    <td className="td td-muted">R {Number(f.annual_amount).toLocaleString()}</td>
                    <td className="td td-muted">{f.monthly_installment ? `R ${Number(f.monthly_installment).toLocaleString()}` : <span className="text-ledger-muted">Lump sum</span>}</td>
                    <td className="td text-right">
                      <button onClick={() => handleGenerateSchedule(f.id)} className="rounded-lg border border-ledger-border bg-ledger-surface px-3 py-1 text-xs font-medium text-ledger-ink hover:bg-ledger-row-hover">
                        <Settings className="mr-1 inline h-3 w-3" /> Generate Schedule
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {fees.length === 0 && <p className="py-8 text-center text-sm text-ledger-muted">{selectedGrade ? 'No fees for this grade/year.' : 'Select a grade to view fees.'}</p>}
          </>
        )}
      </div>
    </div>
  );
}
