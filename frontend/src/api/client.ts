import axios from 'axios';
import type {
  AdminStudentRegisterResponse,
  AppNotification,
  CreditNote,
  EmailSettings,
  FeeStructure,
  Grade,
  GuardianInput,
  Invoice,
  NotificationHistoryResponse,
  NotificationListResponse,
  NotificationSettings,
  PageResponse,
  ParentRegisterPayload,
  ParentRegisterResponse,
  Payment,
  Receipt,
  RegistrationFeeResponse,
  ReminderRunResult,
  ReminderSettings,
  SmsSettings,
  SmsTemplate,
  SmsTemplateRenderResult,
  Student,
  StudentDocument,
  UnreadCountResponse,
  User,
} from '@/types';

// Same-origin by default (Vite dev proxy or a reverse proxy on the same host).
// In production set VITE_API_BASE to the hosted FastAPI backend, e.g.
//   VITE_API_BASE=https://api.yourdomain.com/api/v1
const API_BASE = (import.meta.env.VITE_API_BASE || '/api/v1').replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Attach the bearer token to every request and force a clean logout on 401.
// (Regression guard: this interceptor lives on the shared `api` instance so
// ALL authenticated endpoints — not just uploads — carry the token.)
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A failed LOGIN returns 401 too — redirecting there hard-reloads the page
    // before the form can show the error, so the user sees a silent refresh.
    // Only force-redirect for 401s on authenticated (non-login) requests.
    const url: string | undefined = error.config?.url;
    const isLoginRequest = typeof url === 'string' && url.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Upload helper: multipart requests must NOT set Content-Type manually so the
// browser adds the boundary.
export const uploadApi = axios.create({ baseURL: API_BASE });

uploadApi.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

uploadApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const url: string | undefined = error.config?.url;
    const isLoginRequest = typeof url === 'string' && url.includes('/auth/login');
    if (error.response?.status === 401 && !isLoginRequest) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; must_change_password?: boolean }>('/auth/login', { email, password }),
  register: (data: { email: string; password: string; full_name: string; role: string }) =>
    api.post('/auth/register', data),
  registerParent: (data: ParentRegisterPayload) =>
    api.post<ParentRegisterResponse>('/auth/register/parent', data),
  me: () => api.get('/auth/me'),
  updateMe: (data: { full_name?: string; email?: string; phone?: string }) =>
    api.put('/auth/me', data),
  changePassword: (currentPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword }),
  forgotPassword: (email: string) =>
    api.post<{ detail: string; reset_token?: string | null }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, new_password: newPassword }),
};

// ── Grades ────────────────────────────────────────────────
export const gradesApi = {
  list: () => api.get<Grade[]>('/grades/'),
  get: (id: string) => api.get(`/grades/${id}`),
  create: (data: { name: string; description?: string }) => api.post('/grades/', data),
  update: (id: string, data: { name?: string; description?: string }) =>
    api.put(`/grades/${id}`, data),
  delete: (id: string) => api.delete(`/grades/${id}`),
  archive: (id: string) => api.post(`/grades/${id}/archive`),
  activate: (id: string) => api.post(`/grades/${id}/activate`),
};

// ── Fee Structures ────────────────────────────────────────
export const feesApi = {
  listByGrade: (gradeId: string, year: number) =>
    api.get<FeeStructure[]>(`/grades/${gradeId}/fees?academic_year=${year}`),
  /** Public fee details for the registration form (no auth required) */
  listByGradePublic: (gradeId: string, year: number) =>
    api.get<FeeStructure[]>(`/grades/${gradeId}/fees/public?academic_year=${year}`),
  create: (gradeId: string, data: {
    academic_year: number;
    category: string;
    annual_amount: string | number;
    payment_plan: 'monthly' | 'yearly';
    monthly_installment?: string | number | null;
  }) => api.post(`/grades/${gradeId}/fees`, { ...data, grade_id: gradeId }),
  update: (feeId: string, data: {
    category?: string;
    annual_amount?: string | number;
    payment_plan?: 'monthly' | 'yearly';
    monthly_installment?: string | number | null;
  }) => api.put(`/grades/fees/${feeId}`, data),
  generateSchedule: (feeId: string) => api.post(`/grades/fees/${feeId}/generate-schedule`),
};

// ── Fee Overrides (Discounts) ─────────────────────────────
export interface FeeOverride {
  id: string;
  student_id: string;
  fee_structure_id: string;
  annual_amount: number;
  discount_type: 'override' | 'percent';
  reason: string | null;
  created_by: string | null;
  is_active: boolean;
  created_at: string;
}

export const discountsApi = {
  list: (studentId?: string) =>
    api.get<FeeOverride[]>('/grades/fee-overrides', { params: studentId ? { student_id: studentId } : {} }),
  create: (data: {
    student_id: string;
    fee_structure_id: string;
    annual_amount: number;
    discount_type: 'override' | 'percent';
    reason?: string;
  }) => api.post<FeeOverride>('/grades/fee-overrides', data),
  update: (id: string, data: {
    annual_amount?: number;
    discount_type?: 'override' | 'percent';
    reason?: string;
    is_active?: boolean;
  }) => api.put<FeeOverride>(`/grades/fee-overrides/${id}`, data),
  remove: (id: string) => api.delete(`/grades/fee-overrides/${id}`),
  bulk: (data: {
    student_ids: string[];
    fee_structure_id: string;
    annual_amount: number;
    discount_type: 'override' | 'percent';
    reason?: string;
  }) => api.post<FeeOverride[]>('/grades/fee-overrides/bulk', data),
};

// ── Students ──────────────────────────────────────────────
export const studentsApi = {
  list: (params?: { grade_id?: string; parent_id?: string; search?: string; limit?: number; offset?: number }) =>
    api.get<PageResponse<Student>>('/students/', { params }),
  count: (params?: { grade_id?: string; parent_id?: string; search?: string }) =>
    api.get<{ total: number }>('/students/count', { params }),
  names: () =>
    api.get<{ id: string; student_number: string; first_name: string; last_name: string; grade_id: string }[]>('/students/names'),
  get: (id: string) => api.get(`/students/${id}`),
  getByNumber: (num: string) => api.get(`/students/number/${num}`),
  registrations: (limit?: number) =>
    api.get('/students/registrations', { params: { limit } }),
  create: (data: {
    student_number: string;
    first_name: string;
    last_name: string;
    grade_id: string;
    enrollment_date: string;
    parent_1: GuardianInput;
    parent_2?: GuardianInput;
  }) => api.post('/students/', data),
  update: (id: string, data: {
    student_number?: string;
    first_name?: string;
    last_name?: string;
    grade_id?: string;
    enrollment_date?: string;
    payment_preference?: 'monthly' | 'cumulative';
    guardians?: {
      guardian_id?: string;
      guardian_type?: 'father' | 'mother' | 'primary' | 'secondary';
      full_name?: string;
      phone?: string;
      email?: string;
      physical_address?: string;
      po_box?: string;
    }[];
  }) => api.put(`/students/${id}`, data),
  deactivate: (id: string) => api.delete(`/students/${id}`),
  registerChild: (data: {
    first_name: string;
    last_name: string;
    grade_id: string;
    relationship?: 'father' | 'mother';
    guardian_id?: string;
    phone?: string;
    email?: string;
    physical_address?: string;
    po_box?: string;
    other_parent?: GuardianInput;
  }) => api.post('/students/register-child', data),
  pending: (limit?: number) =>
    api.get('/students/pending', { params: { limit } }),
  approve: (id: string) => api.post(`/students/${id}/approve`),
  reject: (id: string) => api.post(`/students/${id}/reject`),
  setPaymentPreference: (id: string, preference: 'monthly' | 'cumulative') =>
    api.put(`/students/${id}/payment-preference`, { payment_preference: preference }),
  /** Admin self-service: register a student + create/link the parent account
   * in one call. Response includes the one-time temporary_password when a NEW
   * parent account was created. */
  adminRegister: (data: {
    first_name: string;
    last_name: string;
    grade_id: string;
    enrollment_date?: string;
    parent_email: string;
    parent_full_name: string;
    relationship?: 'father' | 'mother';
    guardian_id?: string;
    phone?: string;
    physical_address?: string;
    po_box?: string;
    other_parent?: GuardianInput;
    /** When true, create a registration-fee payment link and SMS it to the guardian. */
    send_payment_sms?: boolean;
  }) => api.post<AdminStudentRegisterResponse>('/students/admin-register', data),
  /** Parent-facing registration fee for a child (amount + paid status). */
  registrationFee: (id: string) =>
    api.get<RegistrationFeeResponse>(`/students/${id}/registration-fee`),
  updateGuardian: (studentId: string, guardianId: string, data: {
    first_name?: string;
    last_name?: string;
    full_name?: string;
    guardian_id?: string;
    phone?: string;
    email?: string;
    physical_address?: string;
    po_box?: string;
  }) => api.put(`/students/${studentId}/guardians/${guardianId}`, data),
};

// ── Application Documents ─────────────────────────────────
export const documentsApi = {
  list: (studentId: string) =>
    api.get<StudentDocument[]>(`/documents/${studentId}`),
  upload: (studentId: string, documentType: string, file: File) => {
    const form = new FormData();
    form.append('doc_type', documentType);
    form.append('file', file);
    return uploadApi.post<StudentDocument>(`/documents/${studentId}`, form);
  },
  downloadUrl: (studentId: string, documentId: string) =>
    `${API_BASE}/documents/${studentId}/files/${documentId}`,
  delete: (studentId: string, documentId: string) =>
    api.delete(`/documents/${studentId}/files/${documentId}`),
};

// ── Additional Charges ────────────────────────────────────
export const chargesApi = {
  list: (studentId: string, year: number) =>
    api.get(`/charges/student/${studentId}?academic_year=${year}`),
  listUnpaid: (studentId: string, year: number) =>
    api.get(`/charges/student/${studentId}/unpaid?academic_year=${year}`),
  create: (data: {
    student_id: string;
    charge_type: string;
    description: string;
    amount: string | number;
    academic_year: number;
    month: number;
  }) => api.post('/charges/', data),
  createForGrade: (data: {
    grade_id: string;
    charge_type: string;
    description: string;
    amount: string | number;
    academic_year: number;
    month: number;
    exclude_student_ids: string[];
  }) => api.post('/charges/grade', data),
  delete: (id: string) => api.delete(`/charges/${id}`),
};

// ── Credit Notes ──────────────────────────────────────────
export const creditNotesApi = {
  issue: (data: {
    student_id: string;
    credit_type: string;
    description: string;
    amount: string | number;
    auto_apply?: boolean;
  }) => api.post<CreditNote>('/credit-notes/', data),
  listForStudent: (studentId: string) =>
    api.get<CreditNote[]>(`/credit-notes/student/${studentId}`),
  listAll: (params?: { limit?: number; offset?: number }) =>
    api.get<CreditNote[]>('/credit-notes/', { params }),
  get: (id: string) => api.get<CreditNote>(`/credit-notes/${id}`),
  apply: (id: string) => api.post<CreditNote>(`/credit-notes/${id}/apply`),
  void: (id: string, reason: string) =>
    api.post<CreditNote>(`/credit-notes/${id}/void`, { reason }),
};

// ── Payments ──────────────────────────────────────────────
export const paymentsApi = {
  list: (params?: { student_id?: string; status?: string; month?: number; year?: number; limit?: number; offset?: number }) =>
    api.get<PageResponse<Payment>>('/payments/', { params }),
  count: (params?: { student_id?: string; status?: string; month?: number; year?: number }) =>
    api.get<{ total: number }>('/payments/count', { params }),
  get: (id: string) => api.get(`/payments/${id}`),
  create: (data: {
    student_id: string;
    amount: string | number;
    payment_method: string;
    payment_date: string;
    reference_number?: string;
    notes?: string;
  }) => api.post('/payments/', data),
  allocate: (data: {
    payment_id: string;
    outstanding_balance_id?: string;
    additional_charge_id?: string;
    amount_allocated: string | number;
  }) => api.post('/payments/allocate', data),
  verify: (paymentId: string, action: 'approve' | 'reject') =>
    api.post('/payments/verify', { payment_id: paymentId, action }),
  reverse: (paymentId: string, reason: string) =>
    api.post('/payments/reverse', { payment_id: paymentId, reason }),
  uploadProof: (paymentId: string, proofUrl: string) =>
    api.post('/payments/upload-proof', { payment_id: paymentId, proof_url: proofUrl }),
  edit: (paymentId: string, data: {
    student_id?: string;
    amount?: string | number;
    payment_method?: string;
    payment_date?: string;
    reference_number?: string;
    notes?: string;
  }) => api.put(`/payments/${paymentId}`, data),
  delete: (paymentId: string) => api.delete(`/payments/${paymentId}`),
};

// ── Financial ─────────────────────────────────────────────
export const financialApi = {
  listReceipts: (params?: { student_id?: string; grade_id?: string; limit?: number; offset?: number }) =>
    api.get<PageResponse<Receipt>>('/financial/receipts', {
      params: {
        student_id: params?.student_id,
        grade_id: params?.grade_id,
        limit: params?.limit,
        offset: params?.offset,
      },
    }),
  getReceipt: (num: string) => api.get(`/financial/receipts/${num}`),
  receiptDownloadUrl: (receiptNumber: string) =>
    `/financial/receipts/${encodeURIComponent(receiptNumber)}/download`,
  generateStatement: (data: { student_id: string; academic_year: number; month: number }) =>
    api.post('/financial/statements/generate', data),
  generateAllStatements: (academic_year: number, month: number, grade_id?: string) =>
    api.post(`/financial/statements/generate-all?academic_year=${academic_year}&month=${month}${grade_id ? `&grade_id=${grade_id}` : ''}`),
  listStatements: (studentId: string, year: number) =>
    api.get(`/financial/statements/${studentId}?academic_year=${year}`),
  statementDownloadUrl: (studentId: string, year: number, month: number) =>
    `/financial/statements/${encodeURIComponent(studentId)}/download?academic_year=${year}&month=${month}`,
  gradeSummaryDownloadUrl: (gradeId: string, year: number, month: number) =>
    `/financial/statements/grade-summary/${encodeURIComponent(gradeId)}/download?academic_year=${year}&month=${month}`,
  triggerRollover: (year: number) =>
    api.post(`/financial/balance-engine/rollover?academic_year=${year}`),
  getTotalDue: (studentId: string, year: number) =>
    api.get(`/financial/balance-engine/total-due/${studentId}?academic_year=${year}`),
  getStudentSummary: (studentId: string, year: number) =>
    api.get(`/financial/student-summary/${studentId}?academic_year=${year}`),
  getNextDueDate: (studentId: string) =>
    api.get(`/financial/next-due-date/${studentId}`),
};

// ── Invoices ──────────────────────────────────────────────
export const invoicesApi = {
  list: (params?: {
    student_id?: string;
    academic_year?: number;
    month?: number;
    status?: string;
    limit?: number;
    offset?: number;
  }) => api.get<PageResponse<Invoice>>('/invoices/', { params }),
  get: (id: string) => api.get<Invoice>(`/invoices/${id}`),
  generate: (data: { student_id: string; academic_year: number; month: number }) =>
    api.post<Invoice>('/invoices/generate', data),
  generateAll: (data: {
    academic_year: number;
    month: number;
    grade_id?: string;
    notify_parents?: boolean;
  }) => api.post<{
    academic_year: number;
    month: number;
    grade_id?: string | null;
    generated: number;
    skipped: number;
    failed: number;
    errors: string[];
    complete: boolean;
  }>('/invoices/generate-all', null, {
    params: {
      academic_year: data.academic_year,
      month: data.month,
      grade_id: data.grade_id || undefined,
      notify_parents: data.notify_parents ?? true,
    },
  }),
  updateStatus: (id: string, status: 'paid' | 'void') =>
    api.post<Invoice>(`/invoices/${id}/status`, { status }),
  downloadUrl: (id: string) => `/invoices/${encodeURIComponent(id)}/download`,
};

/**
 * Download a PDF endpoint as a real file. Fetches through the shared `api`
 * instance so the bearer token is attached, then triggers a browser download
 * using the filename the server sends (Content-Disposition) or a fallback.
 */
export async function downloadPdf(url: string, fallbackName: string) {
  const res = await api.get(url, { responseType: 'blob' });
  const disposition: string | undefined = res.headers['content-disposition'];
  let filename = fallbackName;
  const match = disposition?.match(/filename="?([^"]+)"?/i);
  if (match?.[1]) filename = match[1];

  const blobUrl = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

// ── Reports ───────────────────────────────────────────────
export const reportsApi = {
  monthlySummary: (year: number, month: number, gradeId?: string) =>
    api.get('/financial/reports/monthly-summary', {
      params: { academic_year: year, month, grade_id: gradeId || undefined },
    }),
  monthlyIncome: (year: number, month: number) =>
    api.get(`/financial/reports/monthly-income?academic_year=${year}&month=${month}`),
  yearlyIncome: (year: number) =>
    api.get(`/financial/reports/yearly-income?academic_year=${year}`),
  outstanding: (year: number) =>
    api.get(`/financial/reports/outstanding?academic_year=${year}`),
  paymentsReceived: (year: number, gradeId?: string, method?: string) =>
    api.get('/financial/reports/payments-received', {
      params: { academic_year: year, grade_id: gradeId, payment_method: method },
    }),
  paymentTrends: (year: number) =>
    api.get(`/financial/reports/payment-trends?academic_year=${year}`),
  carryForward: (year: number, month: number) =>
    api.get(`/financial/reports/carry-forward?academic_year=${year}&month=${month}`),
  statements: (year: number, status?: string, gradeId?: string) =>
    api.get('/financial/reports/statements', {
      params: { academic_year: year, status, grade_id: gradeId || undefined },
    }),
};

// ── Notification settings (admin only) ─────────────────────
export const settingsApi = {
  getNotifications: () => api.get<NotificationSettings>('/settings/notifications'),
  updateEmail: (data: {
    enabled: boolean;
    host: string;
    port: number;
    username: string;
    password?: string | null;
    from_email: string;
    from_name: string;
    use_tls: boolean;
  }) => api.put<EmailSettings>('/settings/notifications/email', data),
  updateSms: (data: {
    enabled: boolean;
    provider: string;
    api_key?: string | null;
    api_secret?: string | null;
    sender_id: string;
  }) => api.put<SmsSettings>('/settings/notifications/sms', data),
  testEmail: (to_email: string) =>
    api.post<{ detail: string }>('/settings/email/test', { to_email }),
  getReminders: () => api.get<ReminderSettings>('/settings/reminders'),
  updateReminders: (data: {
    enabled: boolean;
    start_date: string;
    interval_days: number;
    count: number;
  }) => api.put<ReminderSettings>('/settings/reminders', data),
  getRegistrationFee: () => api.get<{ amount: string }>('/settings/registration-fee'),
  updateRegistrationFee: (value: string) =>
    api.put<{ amount: string }>('/settings/registration-fee', { value }),
};

// ── SMS (staff) ──────────────────────────────────────────────
export const smsApi = {
  send: (data: { to_phone: string; content: string; student_id?: string | null }) =>
    api.post<SmsSendResponse>('/sms/send', data),
  test: (to_phone: string) => api.post<SmsSendResponse>('/sms/test', { to_phone }),
  reminders: (academic_year: number, month: number) =>
    api.post<SmsReminderResponse>('/sms/reminders', { academic_year, month }),
  payLinkReminders: () => api.post<ReminderRunResult>('/sms/reminders/paylink'),
  log: (params?: { limit?: number; offset?: number; status?: string }) =>
    api.get<PageResponse<SmsMessage>>(`/sms/messages`, { params }),
  templates: () => api.get<SmsTemplate[]>('/sms/templates'),
  updateTemplate: (key: string, data: { name?: string; body: string; is_active: boolean }) =>
    api.put<SmsTemplate>(`/sms/templates/${key}`, data),
  renderTemplate: (key: string, values: Record<string, string>) =>
    api.post<SmsTemplateRenderResult>(`/sms/templates/${key}/render`, { values }),
  sendToStudent: (data: { student_id: string; template_key?: string; content?: string }) =>
    api.post<SmsSendResponse>('/sms/send-to-student', data),
};

// ── In-app notifications (staff) ─────────────────────────────
export const notificationsApi = {
  list: (params?: { unread_only?: boolean; limit?: number; offset?: number }) =>
    api.get<NotificationListResponse>('/notifications/', { params }),
  unreadCount: () => api.get<UnreadCountResponse>('/notifications/unread-count'),
  markRead: (id: string) => api.post<AppNotification>(`/notifications/${id}/read`),
  markAllRead: () => api.post<UnreadCountResponse>('/notifications/read-all'),
  broadcast: (data: { title: string; message: string }) =>
    api.post<{ in_app_count: number; push_sent: number; push_failed: number }>('/notifications/broadcast', data),
  history: (params?: {
    limit?: number;
    offset?: number;
    category?: string;
    recipient_role?: string;
    search?: string;
  }) => api.get<NotificationHistoryResponse>('/notifications/history', { params }),
};

// ── Users (super_admin) ─────────────────────────────────────
export const usersApi = {
  listStaff: () => api.get<User[]>('/users/'),
  create: (data: {
    email: string;
    password: string;
    full_name: string;
    phone?: string;
    role: 'admin' | 'finance' | 'super_admin';
  }) => api.post<User>('/users/', data),
  update: (id: string, data: {
    full_name?: string;
    email?: string;
    phone?: string;
    role?: 'admin' | 'finance' | 'super_admin';
    is_active?: boolean;
  }) => api.put<User>(`/users/${id}`, data),
  deactivate: (id: string) => api.delete(`/users/${id}`),
  resetPassword: (id: string, newPassword: string) =>
    api.post(`/users/${id}/reset-password`, { new_password: newPassword }),
};

// ── PayFast (parent) ─────────────────────────────────────────
export const payfastApi = {
  initiate: (data: {
    student_id: string;
    amount: number;
    item_name?: string;
    item_description?: string;
  }) => api.post<PayFastInitiateResponse>('/payfast/initiate', data),
};

export interface PayFastInitiateResponse {
  payment_id: string;
  payfast_url: string;
  payment_url: string;
  form_fields: Record<string, string>;
}

export interface SmsSendResponse {
  id: string;
  status: string;
  to_phone: string;
  detail: string;
}

export interface SmsReminderResponse {
  sent: number;
  skipped_no_phone: number;
  skipped_failed: number;
  errors: string[];
}

export interface SmsMessage {
  id: string;
  student_id: string | null;
  to_phone: string;
  content: string;
  template: string;
  status: string;
  provider: string;
  provider_message_id: string | null;
  provider_status: string | null;
  cost: number | null;
  error: string | null;
  created_at: string;
}

export default api;
