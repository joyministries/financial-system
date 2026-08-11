import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authApi, documentsApi, feesApi, gradesApi } from '@/api/client';
import type {
  FeeStructure,
  Grade,
  ParentRegisterPayload,
  ParentRegisterResponse,
  StudentDocument,
} from '@/types';
import toast from 'react-hot-toast';
import AuthLayout from '@/components/auth/AuthLayout';
import {
  BadgeCheck,
  Eye,
  EyeOff,
  FileUp,
  GraduationCap,
  Loader2,
  Plus,
  Trash2,
  UploadCloud,
  Users,
} from 'lucide-react';

const CURRENT_YEAR = new Date().getFullYear();
const MAX_CHILDREN = 5;

const DOCUMENT_TYPES = [
  { value: 'birth_certificate', label: 'Birth Certificate (recommended)' },
  { value: 'transcript', label: 'Transcript / Academic Record' },
  { value: 'report_card', label: 'Report Card' },
  { value: 'id_document', label: 'ID Document' },
  { value: 'other', label: 'Other Document' },
] as const;

interface QueuedFile {
  id: string;
  file: File;
  type: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  error?: string;
}

interface ChildApplication {
  id: string;
  first_name: string;
  last_name: string;
  grade_id: string;
}

let childCounter = 0;
const newChild = (): ChildApplication => ({
  id: `child-${++childCounter}`,
  first_name: '',
  last_name: '',
  grade_id: '',
});

const inputCls =
  'input mt-1';
const labelCls = 'block text-sm font-medium text-slate-700';

export default function RegisterPage() {
  // Students being applied for (one required, more optional)
  const [children, setChildren] = useState<ChildApplication[]>([newChild()]);
  const [grades, setGrades] = useState<Grade[]>([]);
  const [feesByGrade, setFeesByGrade] = useState<Record<string, FeeStructure[] | null>>({});
  const [feesLoadingGrade, setFeesLoadingGrade] = useState<string | null>(null);

  // Parent account
  const [parentFirst, setParentFirst] = useState('');
  const [parentLast, setParentLast] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [physicalAddress, setPhysicalAddress] = useState('');
  const [poBox, setPoBox] = useState('');
  const [relationship, setRelationship] = useState<'father' | 'mother'>('father');

  // Other parent (optional)
  const [showOtherParent, setShowOtherParent] = useState(false);
  const [otherFirst, setOtherFirst] = useState('');
  const [otherLast, setOtherLast] = useState('');
  const [otherPhone, setOtherPhone] = useState('');
  const [otherEmail, setOtherEmail] = useState('');
  const [otherAddress, setOtherAddress] = useState('');
  const [otherPoBox, setOtherPoBox] = useState('');

  // Documents
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [uploaded, setUploaded] = useState<Record<string, StudentDocument[]>>({});
  const [uploading, setUploading] = useState(false);
  const [docStudentId, setDocStudentId] = useState('');

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState<ParentRegisterResponse | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    gradesApi
      .list()
      .then((res) => setGrades(res.data.filter((g) => g.is_active && !g.is_archived)))
      .catch(() => toast.error('Could not load grades. Try again shortly.'));
  }, []);

  // Lazily load the public fee details for each selected grade.
  useEffect(() => {
    const selected = [...new Set(children.map((c) => c.grade_id).filter(Boolean))];
    const toLoad = selected.find((gid) => !(gid in feesByGrade) && gid !== feesLoadingGrade);
    if (!toLoad) return;
    setFeesLoadingGrade(toLoad);
    feesApi
      .listByGradePublic(toLoad, CURRENT_YEAR)
      .then((res) => setFeesByGrade((prev) => ({ ...prev, [toLoad]: res.data.filter((f) => f.is_active) })))
      .catch(() => setFeesByGrade((prev) => ({ ...prev, [toLoad]: [] })))
      .finally(() => setFeesLoadingGrade(null));
  }, [children, feesByGrade, feesLoadingGrade]);

  const updateChild = (id: string, patch: Partial<ChildApplication>) =>
    setChildren((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const addChild = () => {
    if (children.length >= MAX_CHILDREN) return;
    setChildren((prev) => [...prev, newChild()]);
  };

  const removeChild = (id: string) => {
    if (children.length <= 1) return;
    setChildren((prev) => prev.filter((c) => c.id !== id));
  };

  const gradeName = (id: string) => grades.find((g) => g.id === id)?.name ?? '';

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next: QueuedFile[] = Array.from(files).map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      type: 'birth_certificate',
      status: 'pending',
    }));
    setQueue((prev) => [...prev, ...next]);
  };

  const removeQueued = (id: string) => setQueue((prev) => prev.filter((f) => f.id !== id));

  const uploadQueued = async (studentId: string) => {
    setUploading(true);
    const results: StudentDocument[] = [];
    for (const item of queue) {
      setQueue((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, status: 'uploading' } : f))
      );
      try {
        const res = await documentsApi.upload(studentId, item.type, item.file);
        results.push(res.data);
        setQueue((prev) =>
          prev.map((f) => (f.id === item.id ? { ...f, status: 'done' } : f))
        );
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((f) =>
            f.id === item.id
              ? { ...f, status: 'error', error: err?.response?.data?.detail || 'Upload failed' }
              : f
          )
        );
      }
    }
    setUploaded((prev) => ({
      ...prev,
      [studentId]: [...(prev[studentId] || []), ...results],
    }));
    setUploading(false);
    if (results.length) toast.success(`${results.length} document(s) uploaded`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const invalid = children.find((c) => !c.first_name.trim() || !c.last_name.trim() || !c.grade_id);
    if (invalid) return toast.error('Please complete all children\'s details (name and grade)');
    if (!parentFirst.trim() || !parentLast.trim())
      return toast.error('Enter the parent first and last name');
    if (password !== confirm) return toast.error('Passwords do not match');
    if (showOtherParent && (!otherFirst.trim() || !otherLast.trim()))
      return toast.error("Enter the other parent's first and last name or remove the details");

    const [first, ...rest] = children;
    const payload: ParentRegisterPayload = {
      email: email.trim().toLowerCase(),
      password,
      first_name: parentFirst.trim(),
      last_name: parentLast.trim(),
      phone: phone.trim() || undefined,
      physical_address: physicalAddress.trim() || undefined,
      po_box: poBox.trim() || undefined,
      relationship,
      student: {
        first_name: first.first_name.trim(),
        last_name: first.last_name.trim(),
        grade_id: first.grade_id,
      },
      additional_students: rest.map((c) => ({
        first_name: c.first_name.trim(),
        last_name: c.last_name.trim(),
        grade_id: c.grade_id,
      })),
      other_parent: showOtherParent
        ? {
            first_name: otherFirst.trim(),
            last_name: otherLast.trim(),
            phone: otherPhone.trim() || undefined,
            email: otherEmail.trim() || undefined,
            physical_address: otherAddress.trim() || undefined,
            po_box: otherPoBox.trim() || undefined,
          }
        : null,
    };

    setLoading(true);
    try {
      const res = await authApi.registerParent(payload);
      const data = res.data;
      // Log the parent in immediately so the uploaded documents attach to
      // their child and the dashboard is accessible right away.
      localStorage.setItem('token', data.access_token);
      setDocStudentId(data.students[0]?.id || '');
      setSubmitted(data);
      if (queue.length && data.students[0]) {
        await uploadQueued(data.students[0].id);
      }
      toast.success('Application submitted');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const uploadOneMore = async (studentId: string, file: File, type: string) => {
    setUploading(true);
    try {
      const res = await documentsApi.upload(studentId, type, file);
      setUploaded((prev) => ({
        ...prev,
        [studentId]: [...(prev[studentId] || []), res.data],
      }));
      toast.success('Document uploaded');
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  if (submitted) {
    const students = submitted.students;
    return (
      <AuthLayout>
        <div className="rounded-2xl bg-white p-8 shadow-card">
            <div className="mb-6 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-green-100">
                <BadgeCheck className="h-6 w-6 text-green-600" />
              </div>
              <h1 className="mt-3 text-2xl font-bold text-slate-900">Application Submitted</h1>
              <p className="mt-1 text-sm text-slate-500">
                {students.length === 1
                  ? `The school will review the registration for ${students[0].first_name} ${students[0].last_name}.`
                  : `The school will review the registrations for all ${students.length} children.`}
              </p>
            </div>

            {/* One card per registered child */}
            <div className="space-y-3">
              {students.map((student) => (
                <div key={student.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Student ID</p>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      Pending approval
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-2xl font-bold text-primary-600">{student.student_number}</p>
                  <dl className="mt-3 space-y-1 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Student</dt>
                      <dd className="font-medium text-slate-900">
                        {student.first_name} {student.last_name}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Grade applying for</dt>
                      <dd className="font-medium text-slate-900">{gradeName(student.grade_id) || 'Selected grade'}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>

            {/* Document uploads */}
            <div className="mt-4 rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2">
                <FileUp className="h-4 w-4 text-primary-600" />
                <h2 className="text-sm font-semibold text-slate-900">Supporting Documents</h2>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Add the birth certificate, transcripts, or any other required document.
              </p>

              {students.length > 1 && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-slate-700">Child</label>
                  <select
                    value={docStudentId}
                    onChange={(e) => setDocStudentId(e.target.value)}
                    className={inputCls}
                  >
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} ({s.student_number})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {(uploaded[docStudentId] || []).length > 0 && (
                <ul className="mt-3 space-y-1">
                  {(uploaded[docStudentId] || []).map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs"
                    >
                      <span className="truncate text-slate-700">{doc.original_filename}</span>
                      <a
                        href={documentsApi.downloadUrl(docStudentId, doc.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-2 shrink-0 font-medium text-primary-600 hover:text-primary-700"
                      >
                        Open
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3">
                <label className="block text-xs font-medium text-slate-700">Document type</label>
                <select id="post-type" className={inputCls} defaultValue="birth_certificate">
                  {DOCUMENT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-primary-400 hover:text-primary-600">
                <UploadCloud className="h-4 w-4" />
                {uploading ? 'Uploading…' : 'Choose a file (PDF, PNG, JPG — max 10 MB)'}
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg"
                  disabled={uploading}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    const type = (document.getElementById('post-type') as HTMLSelectElement)?.value;
                    if (file && docStudentId) {
                      uploadOneMore(docStudentId, file, type);
                      e.target.value = '';
                    }
                  }}
                />
              </label>
            </div>

            {submitted.payment_url && submitted.registration_fee && (
              <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4">
                <h2 className="text-sm font-semibold text-blue-900">Registration Fee</h2>
                <p className="mt-1 text-sm text-blue-800">
                  A one-time registration fee of{' '}
                  <span className="font-semibold">
                    R {Number(submitted.registration_fee.amount).toLocaleString()}
                  </span>{' '}
                  applies. Pay now through the secure portal to complete your registration.
                </p>
                <a
                  href={submitted.payment_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary mt-3 w-full"
                >
                  Pay registration fee via portal
                </a>
              </div>
            )}

            <button
              onClick={() => navigate('/dashboard')}
              className="btn btn-primary mt-6 w-full"
            >
              Go to my dashboard
            </button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout maxW="lg">
      <div className="rounded-2xl bg-white p-8 shadow-card">
          <div className="mb-6 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary-100">
              <GraduationCap className="h-6 w-6 text-primary-600" />
            </div>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">Parent Registration</h1>
            <p className="mt-1 text-sm text-slate-500">
              Apply for your child(ren) in one step — student IDs are generated automatically.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Students applying for */}
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  1. Student(s) Applying For
                </h2>
                <button
                  type="button"
                  onClick={addChild}
                  disabled={children.length >= MAX_CHILDREN}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:border-primary-400 hover:text-primary-700 disabled:opacity-40"
                >
                  <Plus className="h-3.5 w-3.5" /> Add another child
                </button>
              </div>
              <p className="-mt-2 mb-3 text-xs text-slate-500">
                Registering more than one child? Add them all here — no need to register again later.
              </p>

              <div className="space-y-4">
                {children.map((child, idx) => (
                  <div key={child.id} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-600">
                        Child {idx + 1}{idx === 0 ? ' (required)' : ''}
                      </p>
                      {children.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeChild(child.id)}
                          className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Remove
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>First Name</label>
                        <input
                          type="text"
                          value={child.first_name}
                          onChange={(e) => updateChild(child.id, { first_name: e.target.value })}
                          required
                          placeholder="e.g. Awa"
                          className={inputCls}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>Last Name</label>
                        <input
                          type="text"
                          value={child.last_name}
                          onChange={(e) => updateChild(child.id, { last_name: e.target.value })}
                          required
                          placeholder="e.g. Diallo"
                          className={inputCls}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className={labelCls}>Grade Applying For</label>
                      <select
                        value={child.grade_id}
                        onChange={(e) => updateChild(child.id, { grade_id: e.target.value })}
                        required
                        className={inputCls}
                      >
                        <option value="">Select a grade…</option>
                        {grades.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Registration fee details for the selected grade */}
                    {child.grade_id && (
                      <div className="mt-3 rounded-lg border border-blue-100 bg-blue-50 p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                          Fees for {CURRENT_YEAR} school year
                        </p>
                        {feesLoadingGrade === child.grade_id && feesByGrade[child.grade_id] === undefined ? (
                          <p className="mt-1 flex items-center gap-1 text-xs text-blue-600">
                            <Loader2 className="h-3 w-3 animate-spin" /> Loading fees…
                          </p>
                        ) : (feesByGrade[child.grade_id] || []).length > 0 ? (
                          <ul className="mt-2 space-y-1.5">
                            {(feesByGrade[child.grade_id] || []).map((fee) => (
                              <li key={fee.id} className="flex items-center justify-between text-sm">
                                <span className="text-blue-900">{fee.category}</span>
                                <span className="font-semibold text-blue-900">
                                  R {Number(fee.annual_amount).toLocaleString()}
                                  <span className="ml-1 text-xs font-normal text-blue-600">
                                    /{fee.payment_plan === 'monthly' ? 'month' : 'year'}
                                  </span>
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs text-blue-600">
                            No published fees for this grade yet. The school will confirm fees on approval.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <hr className="border-slate-100" />

            {/* Parent account */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                2. Your Details (Parent Account)
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>First Name</label>
                  <input
                    type="text"
                    value={parentFirst}
                    onChange={(e) => setParentFirst(e.target.value)}
                    required
                    placeholder="e.g. Moussa"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Last Name</label>
                  <input
                    type="text"
                    value={parentLast}
                    onChange={(e) => setParentLast(e.target.value)}
                    required
                    placeholder="e.g. Diallo"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Phone Number</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +260 97 123 45 67"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="you@example.com"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Physical Address</label>
                  <input
                    type="text"
                    value={physicalAddress}
                    onChange={(e) => setPhysicalAddress(e.target.value)}
                    placeholder="e.g. Plot 12, Great North Road"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>PO Box</label>
                  <input
                    type="text"
                    value={poBox}
                    onChange={(e) => setPoBox(e.target.value)}
                    placeholder="e.g. PO Box 50520, Lusaka"
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Password</label>
                  <div className="relative mt-1">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      placeholder="At least 8 characters"
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 text-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Confirm Password</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    className="input mt-1"
                  />
                </div>
              </div>
            </section>

            <hr className="border-slate-100" />

            {/* Relationship */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                3. Your Relationship to the Child
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {(['father', 'mother'] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRelationship(r)}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium capitalize transition ${
                      relationship === r
                        ? 'border-primary-500 bg-primary-50 text-primary-700'
                        : 'border-slate-300 text-slate-600 hover:border-slate-400'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </section>

            <hr className="border-slate-100" />

            {/* Other parent (optional) */}
            <section>
              <button
                type="button"
                onClick={() => setShowOtherParent(!showOtherParent)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:border-slate-300"
              >
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  {relationship === 'father' ? 'Mother' : 'Father'} details {showOtherParent ? '(added)' : ''}
                </span>
                <span className="text-xs text-slate-400">
                  {showOtherParent ? 'Click to remove' : 'Optional — only one parent is required'}
                </span>
              </button>

              {showOtherParent && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>
                        {relationship === 'father' ? 'Mother' : 'Father'}'s First Name
                      </label>
                      <input
                        type="text"
                        value={otherFirst}
                        onChange={(e) => setOtherFirst(e.target.value)}
                        required
                        placeholder="First name"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>
                        {relationship === 'father' ? 'Mother' : 'Father'}'s Last Name
                      </label>
                      <input
                        type="text"
                        value={otherLast}
                        onChange={(e) => setOtherLast(e.target.value)}
                        required
                        placeholder="Last name"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Phone Number</label>
                      <input
                        type="tel"
                        value={otherPhone}
                        onChange={(e) => setOtherPhone(e.target.value)}
                        placeholder="Phone"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>Email</label>
                      <input
                        type="email"
                        value={otherEmail}
                        onChange={(e) => setOtherEmail(e.target.value)}
                        placeholder="Email"
                        className={inputCls}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Physical Address</label>
                      <input
                        type="text"
                        value={otherAddress}
                        onChange={(e) => setOtherAddress(e.target.value)}
                        placeholder="Address"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={labelCls}>PO Box</label>
                      <input
                        type="text"
                        value={otherPoBox}
                        onChange={(e) => setOtherPoBox(e.target.value)}
                        placeholder="PO Box"
                        className={inputCls}
                      />
                    </div>
                  </div>
                </div>
              )}
            </section>

            <hr className="border-slate-100" />

            {/* Documents */}
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
                4. Supporting Documents
              </h2>
              <p className="text-xs text-slate-500">
                Upload the birth certificate, transcripts, or any other required documents.
                You can also add them after submitting.
              </p>

              {queue.length > 0 && (
                <ul className="mt-3 space-y-2">
                  {queue.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <select
                            value={item.type}
                            disabled={item.status !== 'pending'}
                            onChange={(e) =>
                              setQueue((prev) =>
                                prev.map((f) =>
                                  f.id === item.id ? { ...f, type: e.target.value } : f
                                )
                              )
                            }
                            className="w-44 rounded border border-slate-300 px-2 py-1 text-xs"
                          >
                            {DOCUMENT_TYPES.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <span className="truncate text-xs text-slate-700">{item.file.name}</span>
                        </div>
                        {item.status === 'error' && (
                          <p className="mt-1 text-xs text-red-600">{item.error}</p>
                        )}
                      </div>
                      {item.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => removeQueued(item.id)}
                          className="ml-2 shrink-0 text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                      {item.status === 'uploading' && (
                        <Loader2 className="ml-2 h-4 w-4 shrink-0 animate-spin text-primary-600" />
                      )}
                      {item.status === 'done' && (
                        <BadgeCheck className="ml-2 h-4 w-4 shrink-0 text-green-600" />
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <label className="mt-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-3 text-sm text-slate-500 hover:border-primary-400 hover:text-primary-600">
                <UploadCloud className="h-4 w-4" />
                Choose files (PDF, PNG, JPG — max 10 MB each)
                <input
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    addFiles(e.target.files);
                    e.target.value = '';
                  }}
                />
              </label>
            </section>

            <button
              type="submit"
              disabled={loading}
              className="w-full btn btn-primary"
            >
              {loading ? 'Submitting application…' : 'Submit Application'}
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link to="/login" className="font-medium text-primary-600 hover:text-primary-700">
              Sign in
            </Link>
          </p>
        </div>
      </AuthLayout>
  );
}
