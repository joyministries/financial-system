import axios from 'axios';
import * as SecureStore from 'expo-secure-store';
import type {
  Student,
  Payment,
  Grade,
  FeeStructure,
  AdditionalCharge,
  StudentSummary,
  Receipt,
  Statement,
  Invoice,
  RegistrationFeeResponse,
  NextDueDateResponse,
  PageResponse,
  User,
  GuardianInput,
} from '../types';

const API_BASE = (process.env.EXPO_PUBLIC_API_BASE || 'https://backend-financial.vercel.app/api/v1').replace(/\/+$/, '');

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Called by AuthContext to force-logout when a 401 is received mid-session.
let onAuthExpired: (() => void) | null = null;
export function setOnAuthExpired(handler: (() => void) | null) {
  onAuthExpired = handler;
}

// Attach token + handle 401
api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const url: string | undefined = error.config?.url;
    const isLogin = typeof url === 'string' && url.includes('/auth/login');
    if (error.response?.status === 401 && !isLogin) {
      await SecureStore.deleteItemAsync('token');
      // Notify AuthContext so it clears user state and redirects to login
      if (onAuthExpired) onAuthExpired();
    }
    return Promise.reject(error);
  }
);

// ── Auth ──────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post<{ access_token: string; must_change_password?: boolean }>('/auth/login', { email, password }),
  me: () => api.get<User>('/auth/me'),
  updateProfile: (data: { full_name?: string; email?: string; phone?: string }) =>
    api.put<User>('/auth/me', data),
  changePassword: (data: { current_password: string; new_password: string }) =>
    api.post('/auth/change-password', data),
  forgotPassword: (email: string) =>
    api.post<{ detail: string }>('/auth/forgot-password', { email }),
  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, new_password: newPassword }),
  registerParent: (data: any) =>
    api.post('/auth/register/parent', data),
  pushToken: (pushToken: string) =>
    api.post('/auth/push-token', { push_token: pushToken }),
  deletePushToken: () =>
    api.delete('/auth/push-token'),
};

// ── Grades ────────────────────────────────────────
export const gradesApi = {
  list: () => api.get<Grade[]>('/grades/'),
};

// ── Students ──────────────────────────────────────
export const studentsApi = {
  list: (params?: { parent_id?: string; grade_id?: string; search?: string; limit?: number; offset?: number }) =>
    api.get<PageResponse<Student>>('/students/', { params }),
  registerChild: (data: {
    first_name: string;
    last_name: string;
    grade_name?: string;
    grade_id?: string;
    payment_preference?: 'monthly' | 'cumulative';
    relationship?: 'father' | 'mother';
    guardian_id?: string;
    phone?: string;
    email?: string;
    physical_address?: string;
    po_box?: string;
    other_parent?: GuardianInput;
  }) => api.post<Student>('/students/register-child', data),
  registrationFee: (id: string) =>
    api.get<RegistrationFeeResponse>(`/students/${id}/registration-fee`),
  setPaymentPreference: (id: string, preference: 'monthly' | 'cumulative') =>
    api.put(`/students/${id}/payment-preference`, { payment_preference: preference }),
};

// ── Fee Structures ────────────────────────────────
export const feesApi = {
  listByGrade: (gradeId: string, year: number) =>
    api.get<FeeStructure[]>(`/grades/${gradeId}/fees?academic_year=${year}`),
};

// ── Additional Charges ────────────────────────────
export const chargesApi = {
  list: (studentId: string, year: number) =>
    api.get<AdditionalCharge[]>(`/charges/student/${studentId}?academic_year=${year}`),
};

// ── Payments ──────────────────────────────────────
export const paymentsApi = {
  list: (params?: { student_id?: string; month?: number; year?: number; limit?: number; offset?: number }) =>
    api.get<PageResponse<Payment>>('/payments/', { params }),
};

// ── Financial ─────────────────────────────────────
export const financialApi = {
  getTotalDue: (studentId: string, year: number) =>
    api.get<{ total_due: number }>(`/financial/balance-engine/total-due/${studentId}?academic_year=${year}`),
  getStudentSummary: (studentId: string, year: number) =>
    api.get<StudentSummary>(`/financial/student-summary/${studentId}?academic_year=${year}`),
  studentSummary: (studentId: string, year: number) =>
    api.get<StudentSummary>(`/financial/student-summary/${studentId}?academic_year=${year}`),
  listReceipts: (params?: { student_id?: string; limit?: number; offset?: number }) =>
    api.get<PageResponse<Receipt>>('/financial/receipts', { params }),
  receipts: (params?: { student_id?: string; limit?: number; offset?: number }) =>
    api.get<PageResponse<Receipt>>('/financial/receipts', { params }),
  listStatements: (studentId: string, year: number) =>
    api.get<Statement[]>(`/financial/statements/${studentId}`, { params: { academic_year: year } }),
  statements: (studentId: string, year: number) =>
    api.get<Statement[]>(`/financial/statements/${studentId}`, { params: { academic_year: year } }),
  receiptDownloadUrl: (receiptNumber: string) =>
    `${API_BASE}/financial/receipts/${encodeURIComponent(receiptNumber)}/download`,
  statementDownloadUrl: (studentId: string, year: number, month: number) =>
    `${API_BASE}/financial/statements/${encodeURIComponent(studentId)}/download?academic_year=${year}&month=${month}`,
  generateStatement: (studentId: string, year: number, month: number) =>
    api.post<Statement>('/financial/statements/generate', { student_id: studentId, academic_year: year, month }),
  nextDueDate: (studentId: string) =>
    api.get<NextDueDateResponse>(`/financial/next-due-date/${studentId}`),
};

// ── Invoices ──────────────────────────────────────
export const invoicesApi = {
  list: (params?: { student_id?: string; limit?: number }) =>
    api.get<PageResponse<Invoice>>('/invoices/', { params }),
  downloadUrl: (id: string) => `${API_BASE}/invoices/${encodeURIComponent(id)}/download`,
};

// ── PayFast ───────────────────────────────────────
export const payfastApi = {
  initiate: (data: {
    student_id: string;
    amount: number;
    item_name?: string;
    item_description?: string;
  }) => api.post<{
    payment_id: string;
    payfast_url: string;
    payment_url: string;
    form_fields: Record<string, string>;
  }>('/payfast/initiate', data),
};

// ── Notifications ─────────────────────────────────
export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: string;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next_page: boolean;
  has_previous_page: boolean;
}

export const notificationsApi = {
  list: (params?: { unread_only?: boolean; limit?: number; offset?: number }) =>
    api.get<NotificationListResponse>('/notifications/', { params }),
  unreadCount: () =>
    api.get<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) =>
    api.post<NotificationItem>(`/notifications/${id}/read`),
  markAllRead: () =>
    api.post<{ count: number }>('/notifications/read-all'),
};

export default api;
