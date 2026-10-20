import { useEffect, useRef, useState } from 'react';
import {
  studentsApi, financialApi, paymentsApi, gradesApi, feesApi, chargesApi, documentsApi,
  payfastApi, invoicesApi, downloadPdf,
} from '@/api/client';
import { useAuth } from '@/contexts/AuthContext';
import Modal from '@/components/Modal';
import type {
  Student, Payment, Grade, FeeStructure, AdditionalCharge, StudentSummary, Receipt, Statement, StudentDocument, Invoice, RegistrationFeeResponse, NextDueDateResponse,
} from '@/types';
import toast from 'react-hot-toast';
import {
  Loader2, UserPlus, Clock, CheckCircle, XCircle, X, ChevronDown, ChevronRight, Receipt as ReceiptIcon,
  CalendarDays, FileText, Wallet, Save, CreditCard,
} from 'lucide-react';

const statusBadge = (status: string) => {
  if (status === 'pending') return { label: 'Pending approval', cls: 'badge badge-warning', icon: Clock };
  if (status === 'rejected') return { label: 'Rejected', cls: 'badge badge-danger', icon: XCircle };
  return { label: 'Enrolled', cls: 'badge badge-success', icon: CheckCircle };
};

const money = (v: number | string) =>
  Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const monthStatusStyle: Record<string, string> = {
  paid: 'bg-[#1c7a4f] text-white',
  partial: 'bg-[#c9a227] text-[#554211]',
  pending: 'bg-[#a8382c] text-white',
  none: 'bg-line text-muted',
};

const monthStatusLabel: Record<string, string> = {
  paid: 'Paid', partial: 'Partial', pending: 'Unpaid', none: 'No additional charge',
};

interface BreakdownData {
  fees: FeeStructure[];
  charges: AdditionalCharge[];
  totalDue: number;
}

interface FinancialData {
  summary: StudentSummary | null;
  receipts: Receipt[];
  statements: Statement[];
  fees: FeeStructure[];
  charges: AdditionalCharge[];
  documents: StudentDocument[];
  invoices: Invoice[];
}

export default function ParentDashboard() {
  const { user } = useAuth();
  const [children, setChildren] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [summaries, setSummaries] = useState<Record<string, StudentSummary>>({});
  const [regFees, setRegFees] = useState<Record<string, RegistrationFeeResponse>>({});
  const [nextDueDates, setNextDueDates] = useState<Record<string, NextDueDateResponse>>({});
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [paymentMonth, setPaymentMonth] = useState('');
  const [loading, setLoading] = useState(true);
  // Which child card is expanded to show its monthly schedule (null = none)
  const [expandedChild, setExpandedChild] = useState<string | null>(null);

  // Register-child form state
  const [showForm, setShowForm] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [relationship, setRelationship] = useState<'father' | 'mother'>('father');
  const [guardianId, setGuardianId] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [poBox, setPoBox] = useState('');
  const [otherParent, setOtherParent] = useState({
    first_name: '', last_name: '', guardian_id: '', phone: '', email: '', physical_address: '', po_box: '',
  });
  const [showOtherParent, setShowOtherParent] = useState(false);
  const [docFiles, setDocFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Breakdown modal state
  const [breakdownChild, setBreakdownChild] = useState<Student | null>(null);
  const [breakdown, setBreakdown] = useState<BreakdownData | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);

  // Financial modal state
  const [finChild, setFinChild] = useState<Student | null>(null);
  const [finTab, setFinTab] = useState<'schedule' | 'preference' | 'invoices'>('schedule');
  const [finData, setFinData] = useState<FinancialData | null>(null);
  const [loadingFin, setLoadingFin] = useState(false);
  const [prefChoice, setPrefChoice] = useState<'monthly' | 'cumulative'>('monthly');
  const [savingPref, setSavingPref] = useState(false);

  // Pay Online modal state
  const [payChild, setPayChild] = useState<Student | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payItemName, setPayItemName] = useState('');
  const [paying, setPaying] = useState(false);
  const [payCopied, setPayCopied] = useState(false);
  const [payForm, setPayForm] = useState<{
    payment_id: string;
    payfast_url: string;
    payment_url: string;
    form_fields: Record<string, string>;
  } | null>(null);
  const payFormRef = useRef<HTMLFormElement>(null);

  // Auto-submit the PayFast form once initiate returns.
  useEffect(() => {
    if (payForm && payFormRef.current) {
      payFormRef.current.submit();
    }
  }, [payForm]);

  const currentYear = new Date().getFullYear();

  const loadChildren = async () => {
    if (!user) return;
    try {
      const studentsRes = await studentsApi.list({ parent_id: user.id });
      const students = studentsRes.data.items;
      setChildren(students);

      const balancePromises = students.map((s: Student) =>
        financialApi.getTotalDue(s.id, currentYear)
          .then((r) => ({ id: s.id, due: Number(r.data.total_due) }))
          .catch(() => ({ id: s.id, due: 0 }))
      );
      const balanceResults = await Promise.all(balancePromises);
      const balanceMap: Record<string, number> = {};
      balanceResults.forEach((b) => { balanceMap[b.id] = b.due; });
      setBalances(balanceMap);

      const summaryPromises = students.map(async (s: Student) => {
        try {
          const r = await financialApi.getStudentSummary(s.id, currentYear);
          return { id: s.id, summary: r.data };
        } catch { return { id: s.id, summary: null }; }
      });
      const summaryResults = await Promise.all(summaryPromises);
      const summaryMap: Record<string, StudentSummary> = {};
      summaryResults.forEach((r) => { if (r.summary) summaryMap[r.id] = r.summary; });
      setSummaries(summaryMap);

      // Registration fee status per child (amount + paid) for the parent cards.
      const regFeePromises = students.map(async (s: Student) => {
        try {
          const r = await studentsApi.registrationFee(s.id);
          return { id: s.id, fee: r.data };
        } catch { return { id: s.id, fee: { configured: false, amount: 0, paid: false } }; }
      });
      const regFeeResults = await Promise.all(regFeePromises);
      const regFeeMap: Record<string, RegistrationFeeResponse> = {};
      regFeeResults.forEach((r) => { regFeeMap[r.id] = r.fee; });
      setRegFees(regFeeMap);

      // Load next due dates for active approved students
      const dueDatePromises = students
        .filter((s: Student) => s.is_active && s.registration_status === 'approved')
        .map(async (s: Student) => {
          try {
            const r = await financialApi.getNextDueDate(s.id);
            return { id: s.id, data: r.data };
          } catch { return { id: s.id, data: null }; }
        });
      const dueDateResults = await Promise.all(dueDatePromises);
      const dueDateMap: Record<string, NextDueDateResponse> = {};
      dueDateResults.forEach((r) => { if (r.data) dueDateMap[r.id] = r.data; });
      setNextDueDates(dueDateMap);

      if (students.length > 0) {
        const payRes = await paymentsApi.list({ student_id: students[0].id });
        setRecentPayments(payRes.data.items.slice(0, 5));
      }
    } catch {
      // Errors handled per-request above
    } finally {
      setLoading(false);
    }
  };

  // Payments list with optional month filter (empty = all children, all months).
  const loadPayments = async () => {
    if (children.length === 0) { setRecentPayments([]); return; }
    const params: Record<string, string | number> = {};
    if (paymentMonth) {
      const [year, month] = paymentMonth.split('-').map(Number);
      params.year = year;
      params.month = month;
    }
    try {
      const res = await paymentsApi.list(params);
      setRecentPayments(res.data.items.slice(0, 50));
    } catch {
      setRecentPayments([]);
    }
  };

  useEffect(() => { loadPayments(); }, [paymentMonth, children]);

  useEffect(() => {
    gradesApi.list().then((r) => setGrades(r.data));
    loadChildren();
  }, [user]);

  // Handle PayFast return: the backend redirects to /parent?payfast=success&payment_id=…
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('payfast') === 'success') {
      toast.success('Your payment was received. A receipt, confirmation email and SMS will follow.');
      setPayForm(null);
      setPayChild(null);
      setPayAmount('');
      setPayItemName('');
      loadChildren();
      window.history.replaceState({}, '', window.location.pathname);
    } else if (params.get('payfast') === 'cancelled') {
      toast('Payment cancelled — no money was taken.');
      setPayForm(null);
      setPayChild(null);
      setPayAmount('');
      setPayItemName('');
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const openPay = (child: Student, opts?: { amount?: number; itemName?: string }) => {
    setPayAmount((opts?.amount ?? balances[child.id] ?? 0).toFixed(2));
    setPayItemName(opts?.itemName ?? `School Fees — ${child.first_name} ${child.last_name}`);
    setPayChild(child);
    setPayForm(null);
  };

  const closePay = () => {
    if (paying) return;
    setPayChild(null);
    setPayAmount('');
    setPayItemName('');
    setPayForm(null);
  };

  const submitPay = async () => {
    if (!payChild) return;
    const amount = Number(payAmount);
    if (!amount || amount <= 0) {
      toast.error('Enter an amount greater than R0');
      return;
    }
    setPaying(true);
    try {
      const res = await payfastApi.initiate({
        student_id: payChild.id,
        amount,
        item_name: payItemName || `School Fees — ${payChild.first_name} ${payChild.last_name}`,
      });
      setPayForm(res.data);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'Could not start the payment. Please try again.');
    } finally {
      setPaying(false);
    }
  };

  const openRegisterForm = () => {
    setEmail(user?.email || '');
    setShowForm(true);
  };

  const closeRegisterForm = () => {
    setShowForm(false);
    setFirstName('');
    setLastName('');
    setGradeId('');
    setRelationship('father');
    setGuardianId('');
    setPhone('');
    setEmail('');
    setPhysicalAddress('');
    setPoBox('');
    setOtherParent({ first_name: '', last_name: '', guardian_id: '', phone: '', email: '', physical_address: '', po_box: '' });
    setShowOtherParent(false);
    setDocFiles([]);
  };

  const handleRegisterChild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!gradeId) return toast.error('Select a grade');
    const hasOtherName = otherParent.first_name.trim() || otherParent.last_name.trim();
    if (showOtherParent && (hasOtherName && (!otherParent.first_name.trim() || !otherParent.last_name.trim()))) {
      return toast.error('Other parent needs both first and last name');
    }
    setSubmitting(true);
    try {
      const res = await studentsApi.registerChild({
        first_name: firstName,
        last_name: lastName,
        grade_id: gradeId,
        relationship,
        guardian_id: guardianId.trim() || undefined,
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        physical_address: physicalAddress.trim() || undefined,
        po_box: poBox.trim() || undefined,
        other_parent: showOtherParent && hasOtherName
          ? {
              first_name: otherParent.first_name.trim(),
              last_name: otherParent.last_name.trim(),
              guardian_id: otherParent.guardian_id.trim() || undefined,
              phone: otherParent.phone.trim() || undefined,
              email: otherParent.email.trim() || undefined,
              physical_address: otherParent.physical_address.trim() || undefined,
              po_box: otherParent.po_box.trim() || undefined,
            }
          : undefined,
      });
      const student = res.data;
      // Upload all supporting documents attached to this application (one batch).
      let uploaded = 0;
      for (const file of docFiles) {
        try {
          await documentsApi.upload(student.id, 'other', file);
          uploaded += 1;
        } catch {
          // Individual upload failures are reported in the summary below.
        }
      }
      toast.success(
        `Registration submitted (${student.student_number}) — awaiting school approval` +
        (uploaded > 0 ? ` · ${uploaded} document${uploaded === 1 ? '' : 's'} uploaded` : '')
      );
      closeRegisterForm();
      loadChildren();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const openBreakdown = async (child: Student) => {
    setBreakdownChild(child);
    setBreakdown(null);
    setLoadingBreakdown(true);
    try {
      const [feesRes, chargesRes, totalRes] = await Promise.all([
        feesApi.listByGrade(child.grade_id, currentYear),
        chargesApi.list(child.id, currentYear),
        financialApi.getTotalDue(child.id, currentYear),
      ]);
      setBreakdown({
        fees: feesRes.data,
        charges: chargesRes.data,
        totalDue: Number(totalRes.data.total_due || 0),
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to load breakdown');
    } finally {
      setLoadingBreakdown(false);
    }
  };

  const closeBreakdown = () => {
    setBreakdownChild(null);
    setBreakdown(null);
  };

  const openFinancial = async (child: Student) => {
    setFinChild(child);
    setFinTab('schedule');
    setFinData(null);
    setLoadingFin(true);
    setPrefChoice(child.payment_preference || 'monthly');
    try {
      const [summaryRes, receiptsRes, statementsRes, feesRes, chargesRes, invoicesRes] = await Promise.all([
        financialApi.getStudentSummary(child.id, currentYear),
        financialApi.listReceipts({ student_id: child.id }),
        financialApi.listStatements(child.id, currentYear),
        feesApi.listByGrade(child.grade_id, currentYear),
        chargesApi.list(child.id, currentYear),
        invoicesApi.list({ student_id: child.id, limit: 100 }),
      ]);
      setFinData({
        summary: summaryRes.data,
        receipts: receiptsRes.data.items,
        statements: statementsRes.data,
        fees: feesRes.data,
        charges: chargesRes.data,
        documents: [],
        invoices: invoicesRes.data.items,
      });
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to load financials');
    } finally {
      setLoadingFin(false);
    }
  };

  const closeFinancial = () => {
    setFinChild(null);
    setFinData(null);
  };

  const downloadInvoice = async (inv: Invoice) => {
    try {
      await downloadPdf(invoicesApi.downloadUrl(inv.id), `${inv.invoice_number}.pdf`);
    } catch {
      toast.error('Invoice download failed');
    }
  };

  const savePaymentPreference = async () => {
    if (!finChild) return;
    setSavingPref(true);
    try {
      await studentsApi.setPaymentPreference(finChild.id, prefChoice);
      toast.success(prefChoice === 'monthly' ? 'Monthly payment preference saved' : 'Cumulative payment preference saved');
      setChildren((prev) => prev.map((c) => (c.id === finChild.id ? { ...c, payment_preference: prefChoice } : c)));
      loadChildren();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Failed to save preference');
    } finally {
      setSavingPref(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-faint" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-ink">My Children</h1>
        <button
          onClick={openRegisterForm}
          className="btn btn-primary"
        >
          <UserPlus className="h-4 w-4" /> Register Child
        </button>
      </div>

      <Modal open={showForm} onClose={closeRegisterForm} title="Register Your Child">
        <form onSubmit={handleRegisterChild} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Child details */}
          <div className="sm:col-span-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Child</h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-body">First Name</label>
            <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} required className="input mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Last Name</label>
            <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} required className="input mt-1" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-body">Grade</label>
            <select value={gradeId} onChange={(e) => setGradeId(e.target.value)} required className="input mt-1">
              <option value="">Select Grade</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>

          {/* Registering parent's contact details for this application */}
          <div className="sm:col-span-2 mt-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Your Contact Details <span className="font-normal normal-case text-faint">({user?.full_name} — from your account)</span>
            </h3>
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Your relationship to the child</label>
            <select value={relationship} onChange={(e) => setRelationship(e.target.value as 'father' | 'mother')} className="input mt-1">
              <option value="father">Father</option>
              <option value="mother">Mother</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-body">ID / Passport Number</label>
            <input type="text" value={guardianId} onChange={(e) => setGuardianId(e.target.value)} placeholder="National ID / passport" className="input mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+263 7X XXX XXXX" className="input mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-body">Physical Address</label>
            <input type="text" value={physicalAddress} onChange={(e) => setPhysicalAddress(e.target.value)} placeholder="Street, suburb, city" className="input mt-1" />
          </div>
          <div>
            <label className="block text-sm font-medium text-body">P.O. Box</label>
            <input type="text" value={poBox} onChange={(e) => setPoBox(e.target.value)} className="input mt-1" />
          </div>

          {/* Other parent (optional) */}
          <div className="sm:col-span-2 mt-2">
            <button type="button" onClick={() => setShowOtherParent(!showOtherParent)} className="inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-muted hover:text-primary-800">
              <ChevronRight className={`h-4 w-4 transition-transform ${showOtherParent ? 'rotate-90' : ''}`} />
              Other Parent <span className="font-normal normal-case text-faint">(optional)</span>
            </button>
          </div>
          {showOtherParent && (
            <>
              <div>
                <label className="block text-sm font-medium text-body">First Name</label>
                <input type="text" value={otherParent.first_name} onChange={(e) => setOtherParent({ ...otherParent, first_name: e.target.value })} className="input mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-body">Last Name</label>
                <input type="text" value={otherParent.last_name} onChange={(e) => setOtherParent({ ...otherParent, last_name: e.target.value })} className="input mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-body">ID / Passport Number</label>
                <input type="text" value={otherParent.guardian_id} onChange={(e) => setOtherParent({ ...otherParent, guardian_id: e.target.value })} className="input mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-body">Phone</label>
                <input type="tel" value={otherParent.phone} onChange={(e) => setOtherParent({ ...otherParent, phone: e.target.value })} className="input mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-body">Email</label>
                <input type="email" value={otherParent.email} onChange={(e) => setOtherParent({ ...otherParent, email: e.target.value })} className="input mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-body">Physical Address</label>
                <input type="text" value={otherParent.physical_address} onChange={(e) => setOtherParent({ ...otherParent, physical_address: e.target.value })} className="input mt-1" />
              </div>
              <div>
                <label className="block text-sm font-medium text-body">P.O. Box</label>
                <input type="text" value={otherParent.po_box} onChange={(e) => setOtherParent({ ...otherParent, po_box: e.target.value })} className="input mt-1" />
              </div>
            </>
          )}

          {/* Supporting documents — one section, select multiple files at once */}
          <div className="sm:col-span-2 mt-2">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">
              Supporting Documents <span className="font-normal normal-case text-faint">(optional — upload all in one go)</span>
            </h3>
            <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-[#d8d2c4] px-3 py-3 text-sm text-muted hover:border-primary-400 hover:text-primary-800">
              <FileText className="h-4 w-4" /> Choose files to upload
              <input
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (files.length > 0) setDocFiles((prev) => [...prev, ...files]);
                }}
              />
            </label>
            {docFiles.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {docFiles.map((f, i) => (
                  <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-sm">
                    <span className="truncate text-body">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setDocFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="ml-2 shrink-0 text-xs font-medium text-[#a8382c] hover:text-[#8f2e24]"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sm:col-span-2">
            <div className="flex gap-2">
              <button type="submit" disabled={submitting} className="btn btn-primary">
                {submitting ? 'Submitting...' : 'Submit for Approval'}
              </button>
              <button type="button" onClick={closeRegisterForm} disabled={submitting} className="btn btn-secondary">
                Cancel
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">
              The school will review and approve your child's registration. You'll see the status below.
            </p>
          </div>
        </form>
      </Modal>

      {children.length === 0 ? (
        <p className="text-sm text-muted">No children enrolled yet. Use "Register Child" above.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children.map((child) => {
            const badge = statusBadge(child.registration_status);
            const BadgeIcon = badge.icon;
            const due = balances[child.id] || 0;
            const summary = summaries[child.id];
            const currentMonth = new Date().getMonth() + 1;
            return (
              <div key={child.id} className="flex flex-col rounded-xl bg-white p-6 shadow-sm border border-line-soft">
                <button
                  type="button"
                  onClick={() => setExpandedChild(expandedChild === child.id ? null : child.id)}
                  className="flex w-full items-start justify-between gap-2 text-left"
                  title={expandedChild === child.id ? 'Hide monthly schedule' : 'Show monthly schedule'}
                >
                  <div className="min-w-0">
                    <h3 className="font-semibold text-ink">{child.first_name} {child.last_name}</h3>
                    <p className="text-sm text-muted mt-1">{child.student_number}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className={`badge ${badge.cls}`}>
                      <BadgeIcon className="h-3 w-3" /> {badge.label}
                    </span>
                    <ChevronDown
                      className={`h-4 w-4 text-faint transition-transform ${expandedChild === child.id ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>

                {/* Monthly schedule — only shown when the card is pressed/expanded */}
                {summary && expandedChild === child.id && (
                  <div className="mt-4 rounded-lg border border-line bg-[#faf8f2]/60 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-faint">Monthly payments — {currentYear}</p>
                      <button
                        type="button"
                        onClick={() => setExpandedChild(null)}
                        className="text-[11px] font-medium text-faint hover:text-muted"
                      >
                        Hide
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-12 gap-1">
                      {summary.months.map((m) => (
                        <div
                          key={m.month}
                          title={`${MONTHS[m.month]}: ${monthStatusLabel[m.status]} · Required R ${money(m.amount_required)} · Paid R ${money(m.amount_paid)}`}
                          className={`flex h-7 items-center justify-center rounded text-[10px] font-semibold ${monthStatusStyle[m.status]} ${m.month === currentMonth ? 'ring-2 ring-primary-500' : ''}`}
                        >
                          {MONTHS[m.month][0]}
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-muted">
                      <span>Required <b>R {money(summary.total_required)}</b></span>
                      <span>Paid <b className="text-[#1c7a4f]">R {money(summary.total_paid)}</b></span>
                      <span>Due <b className={summary.total_outstanding > 0 ? 'text-[#a8382c]' : 'text-[#1c7a4f]'}>R {money(summary.total_outstanding)}</b></span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-2 text-[10px] text-muted">
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#1c7a4f]" /> Paid</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#c9a227]" /> Partial</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-[#a8382c]" /> Unpaid</span>
                      <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-line" /> No additional charge</span>
                    </div>
                  </div>
                )}

                <div className="mt-3 flex-1">
                  <span className="text-sm text-muted">Outstanding</span>
                  <span className={`ml-2 text-lg font-bold ${due > 0 ? 'text-[#a8382c]' : 'text-[#1c7a4f]'}`}>
                    R {money(due)}
                  </span>
                </div>

                {nextDueDates[child.id]?.next_due_date && (
                  <div className="mt-2 flex items-center gap-2 rounded-lg border border-[#eadfbe] bg-[#fbf4e2] px-3 py-2">
                    <CalendarDays className="h-4 w-4 shrink-0 text-[#8a6f13]" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[#6b5413] truncate">{nextDueDates[child.id].next_description}</p>
                      <p className="text-xs text-[#8a6f13]">
                        Due {new Date(nextDueDates[child.id].next_due_date!).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                        {' · '}R {money(nextDueDates[child.id].next_amount_due)}
                      </p>
                    </div>
                  </div>
                )}

                {due > 0 && (
                  <button
                    onClick={() => openPay(child)}
                    className="btn btn-primary btn-sm mt-3 w-full"
                  >
                    <CreditCard className="h-3.5 w-3.5" /> Pay Online
                  </button>
                )}

                {regFees[child.id]?.configured && (
                  <div className="mt-3 rounded-lg border border-line bg-[#faf8f2]/60 p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-body">Registration Fee</span>
                      <span className="text-sm font-bold text-ink">R {money(regFees[child.id].amount)}</span>
                    </div>
                    <div className="mt-2">
                      {regFees[child.id].paid ? (
                        <span className="badge badge-success">
                          <CheckCircle className="h-3 w-3" /> Paid
                        </span>
                      ) : (
                        <button
                          onClick={() =>
                            openPay(child, {
                              amount: Number(regFees[child.id].amount),
                              itemName: `Registration Fee — ${child.first_name} ${child.last_name}`,
                            })
                          }
                          className="btn btn-primary btn-sm w-full"
                        >
                          <CreditCard className="h-3.5 w-3.5" /> Pay Registration Fee
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => openBreakdown(child)}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-line bg-[#faf8f2] px-3 py-2 text-xs font-medium text-body hover:bg-[#f3efe6]"
                  >
                    <ReceiptIcon className="h-3.5 w-3.5" /> Breakdown
                  </button>
                  <button
                    onClick={() => openFinancial(child)}
                    className="btn btn-primary btn-sm"
                  >
                    <CalendarDays className="h-3.5 w-3.5" /> Financial <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {recentPayments.length > 0 && (
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-ink">Payments</h2>
            <input
              type="month"
              value={paymentMonth}
              onChange={(e) => setPaymentMonth(e.target.value)}
              className="input w-44"
              title="Filter by month"
            />
          </div>
          <div className="rounded-xl bg-white shadow-sm border border-line-soft overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-[#faf8f2]">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Amount</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Method</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {recentPayments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-6 py-4 text-sm text-body">{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm font-medium text-ink">R {money(p.amount)}</td>
                    <td className="px-6 py-4 text-sm text-muted">{p.payment_method}</td>
                    <td className="px-6 py-4">
                      <span className={`badge ${
                        p.status === 'verified' ? 'badge-success' :
                        p.status === 'reversed' ? 'badge-danger' : 'badge-warning'
                      }`}>
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Breakdown modal (what the fees are) ─────────── */}
      {breakdownChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[85vh] w-full max-w-2xl animate-modal-in overflow-y-auto rounded-xl bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-start justify-between border-b border-line-soft bg-white px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Fee Breakdown — {breakdownChild.first_name} {breakdownChild.last_name}</h2>
                <p className="text-sm text-muted">{breakdownChild.student_number} · Academic year {currentYear}</p>
              </div>
              <button onClick={closeBreakdown} className="rounded-lg p-1.5 text-faint hover:bg-[#f3efe6] hover:text-muted" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {loadingBreakdown || !breakdown ? (
              <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-faint" /></div>
            ) : (
              <div className="px-6 py-4 space-y-6">
                <section>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">School Fees</h3>
                  {breakdown.fees.length === 0 ? (
                    <p className="text-sm text-faint">No fee structures set for this grade yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-line">
                      <table className="min-w-full divide-y divide-line">
                        <thead className="bg-[#faf8f2]">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Category</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Plan</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Annual</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Monthly</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                          {breakdown.fees.map((f) => (
                            <tr key={f.id}>
                              <td className="px-4 py-2.5 text-sm font-medium text-ink">{f.category}</td>
                              <td className="px-4 py-2.5 text-sm">
                                <span className={`badge ${f.payment_plan === 'yearly' ? 'badge-info' : 'badge-neutral'}`}>
                                  {f.payment_plan}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right text-sm text-body">R {money(f.annual_amount)}</td>
                              <td className="px-4 py-2.5 text-right text-sm text-body">{f.monthly_installment ? `R ${money(f.monthly_installment)}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                <section>
                  <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Additional Charges</h3>
                  {breakdown.charges.length === 0 ? (
                    <p className="text-sm text-faint">No additional charges for {currentYear}.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-line">
                      <table className="min-w-full divide-y divide-line">
                        <thead className="bg-[#faf8f2]">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Additional Charge</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Month</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Amount</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                          {breakdown.charges.map((c) => (
                            <tr key={c.id}>
                              <td className="px-4 py-2.5">
                                <p className="text-sm font-medium text-ink">{c.charge_type}</p>
                                <p className="text-xs text-muted">{c.description}</p>
                              </td>
                              <td className="px-4 py-2.5 text-sm text-body">{MONTHS[c.month] || c.month}</td>
                              <td className="px-4 py-2.5 text-right text-sm text-body">R {money(c.amount)}</td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`badge ${c.is_paid ? 'badge-success' : 'badge-danger'}`}>
                                  {c.is_paid ? 'Paid' : 'Unpaid'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </section>
                <div className="flex items-center justify-between rounded-xl bg-[#faf8f2] px-4 py-3">
                  <span className="text-sm font-semibold text-body">Total Outstanding</span>
                  <span className={`text-xl font-bold ${breakdown.totalDue > 0 ? 'text-[#a8382c]' : 'text-[#1c7a4f]'}`}>R {money(breakdown.totalDue)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Financial modal (schedule / documents / settings) ── */}
      {finChild && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary-950/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-3xl animate-modal-in flex-col overflow-hidden rounded-xl bg-white shadow-lift" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-line-soft px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  {finChild.first_name} {finChild.last_name} — {currentYear}
                </h2>
                <p className="text-sm text-muted">{finChild.student_number} · {grades.find((g) => g.id === finChild.grade_id)?.name || ''}</p>
              </div>
              <button onClick={closeFinancial} className="rounded-lg p-1.5 text-faint hover:bg-[#f3efe6] hover:text-muted" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex gap-1 border-b border-line-soft bg-[#faf8f2] px-4 pt-2">
              {([
                { key: 'schedule', label: 'Schedule', icon: CalendarDays },
                { key: 'invoices', label: 'Invoices', icon: FileText },
                { key: 'preference', label: 'Payment Preference', icon: Wallet },
              ] as const).map((t) => (
                <button
                  key={t.key}
                  onClick={() => setFinTab(t.key)}
                  className={`inline-flex items-center gap-1.5 rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium ${
                    finTab === t.key ? 'border-primary-600 text-primary-800 bg-white' : 'border-transparent text-muted hover:text-body'
                  }`}
                >
                  <t.icon className="h-4 w-4" /> {t.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4">
              {loadingFin || !finData ? (
                <div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-faint" /></div>
              ) : finTab === 'schedule' ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-[#faf8f2] p-3 text-center">
                      <p className="text-xs text-muted">Required (year)</p>
                      <p className="text-lg font-bold text-ink">R {money(finData.summary?.total_required || 0)}</p>
                    </div>
                    <div className="rounded-xl bg-[#eef6f1] p-3 text-center">
                      <p className="text-xs text-muted">Paid so far</p>
                      <p className="text-lg font-bold text-[#1c7a4f]">R {money(finData.summary?.total_paid || 0)}</p>
                    </div>
                    <div className="rounded-xl bg-[#fbeeec] p-3 text-center">
                      <p className="text-xs text-muted">Outstanding</p>
                      <p className="text-lg font-bold text-[#a8382c]">R {money(finData.summary?.total_outstanding || 0)}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto rounded-lg border border-line">
                    <table className="min-w-full divide-y divide-line">
                      <thead className="bg-[#faf8f2]">
                        <tr>
                          <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Month</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Required</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Paid</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Outstanding</th>
                          <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-line-soft">
                        {finData.summary?.months.map((m) => (
                          <tr key={m.month} className={m.month === new Date().getMonth() + 1 ? 'bg-primary-50' : ''}>
                            <td className="px-4 py-2.5 text-sm font-medium text-ink">
                              {MONTHS[m.month]} {m.month === new Date().getMonth() + 1 && <span className="ml-1 rounded bg-primary-100 px-1.5 py-0.5 text-[10px] font-semibold text-primary-800">current</span>}
                            </td>
                            <td className="px-4 py-2.5 text-right text-sm text-body">R {money(m.amount_required)}</td>
                            <td className="px-4 py-2.5 text-right text-sm text-[#1c7a4f]">R {money(m.amount_paid)}</td>
                            <td className={`px-4 py-2.5 text-right text-sm font-medium ${m.outstanding > 0 ? 'text-[#a8382c]' : 'text-faint'}`}>R {money(m.outstanding)}</td>
                            <td className="px-4 py-2.5 text-right">
                              <span className={`badge ${
                                m.status === 'paid' ? 'badge-success' :
                                m.status === 'partial' ? 'badge-warning' :
                                m.status === 'pending' ? 'badge-danger' : 'badge-neutral'
                              }`}>
                                {monthStatusLabel[m.status]}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : finTab === 'invoices' ? (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Invoices</h3>
                  {finData.invoices.length === 0 ? (
                    <p className="rounded-lg bg-[#faf8f2] px-4 py-6 text-center text-sm text-muted">
                      No invoices yet. The school office issues an invoice each billing month — it will appear here
                      automatically, ready to download.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-line">
                      <table className="min-w-full divide-y divide-line">
                        <thead className="bg-[#faf8f2]">
                          <tr>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Invoice #</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Period</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-muted uppercase">Due date</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Balance due</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase">Status</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-muted uppercase"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line-soft">
                          {finData.invoices.map((inv) => (
                            <tr key={inv.id}>
                              <td className="px-4 py-2.5 font-mono text-sm font-medium text-ink">{inv.invoice_number}</td>
                              <td className="px-4 py-2.5 text-sm text-body">
                                {MONTHS[inv.month]} {inv.academic_year}
                              </td>
                              <td className="px-4 py-2.5 text-sm text-body">
                                {new Date(inv.due_date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                              </td>
                              <td className={`px-4 py-2.5 text-right text-sm font-medium ${inv.balance_due > 0 ? 'text-[#a8382c]' : 'text-faint'}`}>
                                R {money(inv.balance_due)}
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <span className={`badge ${
                                  inv.status === 'paid' ? 'badge-success' :
                                  inv.status === 'issued' ? 'badge-warning' : 'badge-neutral'
                                }`}>
                                  {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right">
                                <button
                                  onClick={() => downloadInvoice(inv)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1.5 text-xs font-medium text-body hover:bg-[#fdfbf5]"
                                  aria-label={`Download ${inv.invoice_number}`}
                                >
                                  <FileText className="h-3.5 w-3.5" /> PDF
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted">Payment Preference</h3>
                  <p className="text-sm text-muted">
                    Choose how you would like to pay for {finChild.first_name}&apos;s fees for {currentYear}.
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => setPrefChoice('monthly')}
                      className={`rounded-xl border-2 p-4 text-left transition ${
                        prefChoice === 'monthly'
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-line hover:border-primary-300'
                      }`}
                    >
                      <p className="text-sm font-semibold text-ink">Monthly Payment</p>
                      <p className="mt-1 text-xs text-muted">
                        Pay each month&apos;s installment as it falls due (e.g. the monthly amount on your schedule).
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPrefChoice('cumulative')}
                      className={`rounded-xl border-2 p-4 text-left transition ${
                        prefChoice === 'cumulative'
                          ? 'border-primary-600 bg-primary-50'
                          : 'border-line hover:border-primary-300'
                      }`}
                    >
                      <p className="text-sm font-semibold text-ink">Cumulative Payment</p>
                      <p className="mt-1 text-xs text-muted">
                        Pay the full year&apos;s fees in one lump sum (e.g. the total annual amount).
                      </p>
                    </button>
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={savePaymentPreference}
                      disabled={savingPref}
                      className="inline-flex items-center gap-1.5 btn btn-primary"
                    >
                      <Save className="h-4 w-4" /> {savingPref ? 'Saving...' : 'Save Preference'}
                    </button>
                  </div>
                  <p className="text-xs text-faint">
                    This tells the school how you intend to pay. Fees remain billed per the school&apos;s schedule.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pay Online modal — initiates a PayFast payment for one child */}
      <Modal open={!!payChild} onClose={closePay} title="Pay Online">
        {payChild && (
          <div className="space-y-4">
            <div className="rounded-lg bg-[#faf8f2] px-4 py-3 text-sm">
              <p className="text-muted">Paying for</p>
              <p className="font-semibold text-ink">
                {payChild.first_name} {payChild.last_name}
                <span className="ml-2 font-normal text-faint">{payChild.student_number}</span>
              </p>
              <p className="mt-1 text-muted">
                Outstanding:{' '}
                <b className={balances[payChild.id] > 0 ? 'text-[#a8382c]' : 'text-[#1c7a4f]'}>
                  R {money(balances[payChild.id] || 0)}
                </b>
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-body">Amount (ZAR)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                disabled={!!payForm || paying}
                className="input mt-1"
              />
              <p className="mt-1 text-xs text-muted">
                You'll be taken to PayFast (secure card / instant EFT). Your receipt and an SMS
                confirmation are sent automatically once the payment is confirmed.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closePay}
                disabled={paying}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitPay}
                disabled={paying || !!payForm}
                className="btn btn-primary"
              >
                <CreditCard className="h-4 w-4" />
                {paying ? 'Contacting PayFast…' : 'Continue to PayFast'}
              </button>
            </div>

            {payForm && (
              <>
                <form
                  ref={payFormRef}
                  action={payForm.payfast_url}
                  method="POST"
                  className="hidden"
                  target="_self"
                >
                  {Object.entries(payForm.form_fields).map(([name, value]) => (
                    <input key={name} type="hidden" name={name} value={value} />
                  ))}
                </form>
                <div className="rounded-lg border border-accent-200 bg-accent-50 px-4 py-3">
                  <p className="text-xs font-medium text-accent-800">
                    Payment link ready
                  </p>
                  <p className="mt-1 break-all text-xs text-muted">{payForm.payment_url}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(payForm.payment_url);
                        setPayCopied(true);
                        setTimeout(() => setPayCopied(false), 2000);
                      }}
                      className="btn btn-secondary btn-sm"
                    >
                      {payCopied ? 'Copied ✓' : 'Copy link'}
                    </button>
                    <span className="self-center text-xs text-muted">
                      Send this link to pay from any phone — no login needed
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
