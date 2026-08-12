import { useEffect, useState } from 'react';
import { studentsApi, gradesApi, smsApi, paymentsApi, financialApi } from '@/api/client';
import type { AdminStudentRegisterResponse, Student, Grade, SmsTemplate, Payment, Statement } from '@/types';
import toast from 'react-hot-toast';
import { Plus, Pencil, UserX, UserPlus, Copy, Loader2, MessageSquare, Send, Eye, Search } from 'lucide-react';
import Modal from '@/components/Modal';
import Pagination from '@/components/Pagination';
import { isUuid } from '@/lib/isUuid';

const DEFAULT_PAGE_SIZE = 50;

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [filterGrade, setFilterGrade] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [totalCount, setTotalCount] = useState(0);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [studentNum, setStudentNum] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gradeId, setGradeId] = useState('');
  const [enrollDate, setEnrollDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentPref, setPaymentPref] = useState<'monthly' | 'cumulative'>('monthly');
  const [editGuardians, setEditGuardians] = useState<{
    id: string;
    guardian_type: string;
    full_name: string;
    phone: string;
    email: string;
    physical_address: string;
    po_box: string;
  }[]>([]);

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
  const [arSendSms, setArSendSms] = useState(false);

  const load = () => {
    setLoading(true);
    const params = {
      ...(filterGrade ? { grade_id: filterGrade } : {}),
      ...(search ? { search } : {}),
      limit: pageSize,
      offset: (page - 1) * pageSize,
    };
    studentsApi.list(params)
      .then((r) => {
        setStudents(r.data.items);
        setTotalCount(r.data.total);
      })
      .catch(() => toast.error('Failed to load students'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { gradesApi.list().then((r) => setGrades(r.data)); }, []);
  useEffect(() => { load(); }, [filterGrade, search, page, pageSize]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      if (editingId) {
        await studentsApi.update(editingId, {
          first_name: firstName,
          last_name: lastName,
          grade_id: gradeId,
          enrollment_date: new Date(enrollDate).toISOString(),
          payment_preference: paymentPref,
          guardians: editGuardians.map((g) => ({
            guardian_id: g.id,
            guardian_type: g.guardian_type as 'father' | 'mother' | 'primary' | 'secondary',
            full_name: g.full_name || undefined,
            phone: g.phone || undefined,
            email: g.email || undefined,
            physical_address: g.physical_address || undefined,
            po_box: g.po_box || undefined,
          })),
        });
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
    setPaymentPref('monthly'); setEditGuardians([]);
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
    setArSendSms(false);
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
        send_payment_sms: arSendSms,
      });
      setAdminRegisterResult(data);
      if (data.temporary_password) {
        toast.success('Student registered and parent account created');
      } else {
        toast.success('Student registered, linked to existing parent account');
      }
      if (data.sms_sent) toast.success('Registration fee payment link SMS sent to the guardian');
      else if (data.sms_error) toast.error(data.sms_error);
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
    setEnrollDate(s.enrollment_date ? s.enrollment_date.slice(0, 10) : new Date().toISOString().split('T')[0]);
    setPaymentPref(s.payment_preference === 'cumulative' ? 'cumulative' : 'monthly');
    setEditGuardians((s.guardians || []).map((g) => ({
      id: g.id,
      guardian_type: g.guardian_type,
      full_name: g.full_name || '',
      phone: g.phone || '',
      email: g.email || '',
      physical_address: g.physical_address || '',
      po_box: g.po_box || '',
    })));
    setShowForm(true);
  };

  // ── View student (full profile + financial snapshot) ──────
  const [viewing, setViewing] = useState<Student | null>(null);
  const [viewPayments, setViewPayments] = useState<Payment[]>([]);
  const [viewStatements, setViewStatements] = useState<Statement[]>([]);
  const [viewLoading, setViewLoading] = useState(false);

  const openView = async (s: Student) => {
    setViewing(s);
    setViewPayments([]);
    setViewStatements([]);
    setViewLoading(true);
    try {
      const year = new Date().getFullYear();
      const [payRes, stmtRes] = await Promise.all([
        paymentsApi.list({ student_id: s.id, limit: 6 }).catch(() => ({ data: { items: [] as Payment[] } })),
        financialApi.listStatements(s.id, year).catch(() => ({ data: [] as Statement[] })),
      ]);
      setViewPayments(payRes.data.items);
      setViewStatements(stmtRes.data);
    } finally {
      setViewLoading(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    if (!confirm('Deactivate this student?')) return;
    try {
      await studentsApi.deactivate(id);
      toast.success('Student deactivated');
      load();
    } catch { toast.error('Failed to deactivate'); }
  };

  // ── SMS to a single parent ─────────────────────────────────
  const [smsTarget, setSmsTarget] = useState<Student | null>(null);
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplate[]>([]);
  const [smsTemplateKey, setSmsTemplateKey] = useState('');
  const [smsContent, setSmsContent] = useState('');
  const [smsLoading, setSmsLoading] = useState(false);
  const [smsSending, setSmsSending] = useState(false);

  const openSmsModal = async (s: Student) => {
    setSmsTarget(s);
    setSmsTemplateKey('');
    setSmsContent('');
    setSmsLoading(true);
    try {
      const res = await smsApi.templates();
      setSmsTemplates(res.data.filter((t) => t.is_active));
    } catch {
      toast.error('Failed to load message templates');
    } finally {
      setSmsLoading(false);
    }
  };

  const selectSmsTemplate = async (key: string) => {
    setSmsTemplateKey(key);
    if (!smsTarget || !key) {
      setSmsContent('');
      return;
    }
    setSmsLoading(true);
    try {
      const values: Record<string, string> = {
        parent: smsTarget.guardians?.[0]?.full_name?.split(' ')[0] || 'Parent',
        student: smsTarget.first_name,
        amount: '{amount}',
        balance: '{balance}',
        month: String(new Date().getMonth() + 1),
        year: String(new Date().getFullYear()),
        receipt: 'RCP-XXXX',
        link: 'https://…/pay/XXXX',
      };
      const res = await smsApi.renderTemplate(key, values);
      setSmsContent(res.data.content);
    } catch {
      toast.error('Could not preview template');
    } finally {
      setSmsLoading(false);
    }
  };

  const sendSmsToParent = async () => {
    if (!smsTarget) return;
    if (!smsContent.trim()) return toast.error('Message content is empty');
    setSmsSending(true);
    try {
      await smsApi.sendToStudent({
        student_id: smsTarget.id,
        template_key: smsTemplateKey || undefined,
        content: smsContent.trim(),
      });
      toast.success(`SMS sent to ${smsTarget.first_name}'s parent`);
      setSmsTarget(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? 'SMS send failed');
    } finally {
      setSmsSending(false);
    }
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

      <form onSubmit={submitSearch} className="flex flex-wrap items-center gap-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or student number…"
            className="input pl-9"
          />
        </div>
        <select value={filterGrade} onChange={(e) => { setFilterGrade(e.target.value); setPage(1); }} className="input w-44">
          <option value="">All Grades</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button type="submit" className="btn btn-primary">Search</button>
        {!loading && (
          <span className="text-sm text-slate-500">
            {totalCount.toLocaleString()} student{totalCount === 1 ? '' : 's'}
            {search ? ` matching “${search}”` : ''}
          </span>
        )}
      </form>

      <Modal open={showForm} onClose={closeForm} title={editingId ? 'Edit Student' : 'New Student'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {editingId && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700">Student Number</label>
                <input value={studentNum || (students.find((s) => s.id === editingId)?.student_number || '')} disabled className="input mt-1 font-mono" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">Enrollment Date</label>
                  <input type="date" value={enrollDate} onChange={(e) => setEnrollDate(e.target.value)} className="input mt-1" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Payment Preference</label>
                  <select value={paymentPref} onChange={(e) => setPaymentPref(e.target.value as 'monthly' | 'cumulative')} className="input mt-1">
                    <option value="monthly">Monthly installments</option>
                    <option value="cumulative">Cumulative</option>
                  </select>
                </div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="mb-3 text-sm font-semibold text-slate-700">Parents / Guardians</p>
                <div className="space-y-4">
                  {editGuardians.length === 0 && (
                    <p className="text-sm text-slate-500">No guardians on file.</p>
                  )}
                  {editGuardians.map((g, idx) => (
                    <div key={g.id} className="rounded-lg border border-slate-200 bg-white p-3">
                      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        {g.guardian_type === 'father' ? 'Father' : g.guardian_type === 'mother' ? 'Mother' : g.guardian_type === 'primary' ? 'Primary Guardian' : 'Secondary Guardian'}
                      </p>
                      <div className="space-y-2">
                        <input
                          value={g.full_name}
                          onChange={(e) => setEditGuardians((prev) => prev.map((x, i) => (i === idx ? { ...x, full_name: e.target.value } : x)))}
                          placeholder="Full name"
                          className="input"
                        />
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={g.phone}
                            onChange={(e) => setEditGuardians((prev) => prev.map((x, i) => (i === idx ? { ...x, phone: e.target.value } : x)))}
                            placeholder="Phone"
                            className="input"
                          />
                          <input
                            value={g.email}
                            onChange={(e) => setEditGuardians((prev) => prev.map((x, i) => (i === idx ? { ...x, email: e.target.value } : x)))}
                            type="email"
                            placeholder="Email"
                            className="input"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={g.physical_address}
                            onChange={(e) => setEditGuardians((prev) => prev.map((x, i) => (i === idx ? { ...x, physical_address: e.target.value } : x)))}
                            placeholder="Physical address"
                            className="input"
                          />
                          <input
                            value={g.po_box}
                            onChange={(e) => setEditGuardians((prev) => prev.map((x, i) => (i === idx ? { ...x, po_box: e.target.value } : x)))}
                            placeholder="PO Box"
                            className="input"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
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
            {adminRegisterResult.payment_url && (
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
                <p className="text-sm font-semibold text-blue-800">Registration fee payment link</p>
                <p className="mt-1 text-xs text-blue-600">
                  {adminRegisterResult.sms_sent
                    ? 'Payment link SMS sent to the guardian. You can also share it directly:'
                    : 'The payment link could not be SMSed — share it directly with the guardian:'}
                  {adminRegisterResult.sms_error && (
                    <span className="block font-medium text-amber-600">
                      {adminRegisterResult.sms_error}
                    </span>
                  )}
                </p>
                <a
                  href={adminRegisterResult.payment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-flex max-w-full items-center gap-1 truncate rounded-lg border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100"
                >
                  <Send className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{adminRegisterResult.payment_url}</span>
                </a>
              </div>
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
                <label className="flex items-start gap-2 rounded-lg border border-primary-100 bg-white p-2.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={arSendSms}
                    onChange={(e) => setArSendSms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                  />
                  <span>
                    Send the registration fee payment link to the guardian by SMS
                    <span className="block text-xs text-slate-400">
                      Requires a registration fee to be set in Settings. The parent pays through the portal.
                    </span>
                  </span>
                </label>
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

      <div className="rounded-xl bg-white shadow-sm border border-slate-100 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Number</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Name</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Grade</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Parents</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Phone</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-slate-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {loading ? (
              <tr><td colSpan={7} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto" /></td></tr>
            ) : students.length === 0 ? (
              <tr><td colSpan={7} className="py-8 text-center text-sm text-slate-500">No students found.</td></tr>
            ) : students.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50">
                <td className="px-6 py-4 text-sm font-mono text-slate-700">{s.student_number}</td>
                <td className="px-6 py-4 text-sm font-medium text-slate-900">{s.first_name} {s.last_name}</td>
                <td className="px-6 py-4 text-sm text-slate-500">{grades.find((g) => g.id === s.grade_id)?.name || s.grade_id}</td>
                <td className="px-6 py-4">
                  <div className="text-sm text-slate-700">
                    {s.guardians?.map((g) => {
                      const isMother = g.guardian_type === 'mother' || g.guardian_type === 'secondary';
                      return (
                        <div key={g.id} className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            {isMother ? 'Mother:' : 'Father:'}
                          </span>
                          <span>{g.full_name}</span>
                        </div>
                      );
                    })}
                    {(!s.guardians || s.guardians.length === 0) && <span className="text-slate-400">-</span>}
                  </div>
                </td>
                <td className="px-6 py-4 text-sm font-mono text-slate-500">
                  {s.guardians?.length
                    ? s.guardians.map((g) => <div key={g.id}>{g.phone || '-'}</div>)
                    : <span className="text-slate-400">-</span>}
                </td>
                <td className="px-6 py-4">
                  <span className={`badge ${s.is_active ? 'badge-success' : 'badge-danger'}`}>
                    {s.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex justify-end gap-1">
                    <button onClick={() => openView(s)} className="rounded p-1 text-slate-400 hover:text-blue-600" title="View full profile"><Eye className="h-4 w-4" /></button>
                    <button onClick={() => openSmsModal(s)} className="rounded p-1 text-slate-400 hover:text-green-600" title="Send SMS to parent"><MessageSquare className="h-4 w-4" /></button>
                    <button onClick={() => handleEdit(s)} className="rounded p-1 text-slate-400 hover:text-blue-600" title="Edit"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => handleDeactivate(s.id)} className="rounded p-1 text-slate-400 hover:text-red-600" title="Deactivate"><UserX className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Pagination
          page={page}
          totalPages={Math.max(1, Math.ceil(totalCount / pageSize))}
          total={totalCount}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
        />
      </div>

      {/* ── View student modal ─────────────────────────────── */}
      <Modal
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? `${viewing.first_name} ${viewing.last_name}` : ''}
        subtitle={viewing ? `${viewing.student_number} · ${grades.find((g) => g.id === viewing.grade_id)?.name || '—'}` : ''}
      >
        {viewing && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <Info label="First name" value={viewing.first_name} />
              <Info label="Last name" value={viewing.last_name} />
              <Info label="Student number" value={viewing.student_number} />
              <Info label="Grade" value={grades.find((g) => g.id === viewing.grade_id)?.name || viewing.grade_id} />
              <Info label="Enrollment date" value={new Date(viewing.enrollment_date).toLocaleDateString()} />
              <Info label="Payment preference" value={viewing.payment_preference === 'monthly' ? 'Monthly' : 'Full year'} />
              <Info label="Status" value={viewing.is_active ? 'Active' : 'Inactive'} />
              <Info label="Registration" value={viewing.registration_status} />
              <Info label="Portal account" value={viewing.parent_id ? 'Linked' : 'None'} />
            </div>

            <div>
              <h4 className="text-sm font-semibold text-slate-900">Parents / Guardians</h4>
              <div className="mt-2 space-y-2">
                {viewing.guardians?.length ? viewing.guardians.map((g) => (
                  <div key={g.id} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <p className="font-medium text-slate-900">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {g.guardian_type === 'mother' || g.guardian_type === 'secondary' ? 'Mother · ' : 'Father · '}
                      </span>
                      {g.full_name}
                    </p>
                    <div className="mt-1 grid grid-cols-1 gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-2">
                      {g.phone && <span>Phone: <span className="font-mono">{g.phone}</span></span>}
                      {g.email && <span>Email: {g.email}</span>}
                      {g.guardian_id && !isUuid(g.guardian_id) && <span>ID: {g.guardian_id}</span>}
                      {g.physical_address && <span>Address: {g.physical_address}</span>}
                      {g.po_box && <span>PO Box: {g.po_box}</span>}
                      {!g.phone && !g.email && !g.guardian_id && !g.physical_address && !g.po_box && (
                        <span className="text-slate-400">No contact details on file.</span>
                      )}
                    </div>
                  </div>
                )) : (
                  <p className="text-sm text-slate-400">No guardian records.</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Recent payments</h4>
                {viewLoading ? (
                  <div className="py-4 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-300" /></div>
                ) : viewPayments.length ? (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {viewPayments.map((p) => (
                      <li key={p.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <div>
                          <p className="font-medium text-slate-800">R {p.amount.toLocaleString()}</p>
                          <p className="text-xs text-slate-400">
                            {new Date(p.payment_date).toLocaleDateString()} · {p.payment_method}
                          </p>
                        </div>
                        <span className={`badge ${p.status === 'verified' ? 'badge-success' : p.status === 'pending' ? 'badge-warning' : 'badge-danger'}`}>
                          {p.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">No payments recorded.</p>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Statements ({new Date().getFullYear()})</h4>
                {viewLoading ? (
                  <div className="py-4 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-300" /></div>
                ) : viewStatements.length ? (
                  <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
                    {viewStatements.slice(0, 4).map((st) => (
                      <li key={st.id} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="text-slate-700">Month {st.month}</span>
                        <span className={`font-medium ${Number(st.closing_balance) > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          R {Number(st.closing_balance).toLocaleString()}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-slate-400">No statements generated yet.</p>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* ── SMS to parent modal ─────────────────────────────── */}
      <Modal
        open={!!smsTarget}
        onClose={() => setSmsTarget(null)}
        title={`Send SMS — ${smsTarget ? `${smsTarget.first_name} ${smsTarget.last_name}` : ''}`}
        subtitle={
          smsTarget?.guardians?.[0]?.phone
            ? `Parent: ${smsTarget.guardians[0].full_name} · ${smsTarget.guardians[0].phone}`
            : 'This student has no guardian mobile number on file.'
        }
      >
        {smsTarget && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700">Message template</label>
              <select
                value={smsTemplateKey}
                onChange={(e) => selectSmsTemplate(e.target.value)}
                className="input mt-1"
                disabled={smsLoading}
              >
                <option value="">Custom message (no template)</option>
                {smsTemplates.map((t) => (
                  <option key={t.key} value={t.key}>{t.name}</option>
                ))}
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Pick a template to pre-fill the message, then edit the text below before sending.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700">Message</label>
              {smsLoading ? (
                <div className="mt-2 flex h-24 items-center justify-center rounded-lg border border-slate-200">
                  <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                </div>
              ) : (
                <textarea
                  value={smsContent}
                  onChange={(e) => setSmsContent(e.target.value)}
                  rows={4}
                  maxLength={1600}
                  placeholder="Type your message to this parent…"
                  className="input mt-1"
                />
              )}
              <p className="mt-1 text-right text-xs text-slate-400">{smsContent.length}/1600</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={sendSmsToParent}
                disabled={smsSending || smsLoading || !smsContent.trim()}
                className="btn btn-primary"
              >
                <Send className="h-4 w-4" />
                {smsSending ? 'Sending…' : 'Send SMS'}
              </button>
              <button
                type="button"
                onClick={() => setSmsTarget(null)}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 font-medium text-slate-900">{value || '—'}</dd>
    </div>
  );
}
