export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'finance' | 'parent' | 'super_admin';
  is_active: boolean;
}

export interface GuardianInput {
  /** Provide full_name OR first_name + last_name */
  first_name?: string;
  last_name?: string;
  full_name?: string;
  guardian_id?: string;
  phone?: string;
  email?: string;
  physical_address?: string;
  po_box?: string;
}

export interface ParentRegisterPayload {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  phone?: string;
  physical_address?: string;
  po_box?: string;
  /** The registering parent is the child's father or mother */
  relationship: 'father' | 'mother';
  student: {
    first_name: string;
    last_name: string;
    grade_id: string;
  };
  /** Extra children applied for in the same submission (optional) */
  additional_students?: {
    first_name: string;
    last_name: string;
    grade_id: string;
  }[];
  /** The other parent's details (optional — only one parent is required) */
  other_parent?: GuardianInput | null;
}

export interface ParentRegisterResponse {
  user: User;
  students: Student[];
  access_token: string;
}

export interface Grade {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_archived: boolean;
  created_at: string;
}

export interface FeeStructure {
  id: string;
  grade_id: string;
  academic_year: number;
  category: string;
  annual_amount: number;
  payment_plan: 'monthly' | 'yearly';
  monthly_installment: number | null;
  is_active: boolean;
}

export interface Guardian {
  id: string;
  student_id: string;
  guardian_type: 'father' | 'mother' | 'primary' | 'secondary';
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  guardian_id: string | null;
  phone: string | null;
  email: string | null;
  physical_address: string | null;
  po_box: string | null;
}

export interface StudentDocument {
  id: string;
  student_id: string;
  document_type:
    | 'birth_certificate'
    | 'transcript'
    | 'report_card'
    | 'id_document'
    | 'other';
  original_filename: string;
  content_type: string | null;
  file_size: number;
  created_at: string;
}

export interface Student {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  grade_id: string;
  parent_id: string | null;
  enrollment_date: string;
  is_active: boolean;
  registration_status: 'pending' | 'approved' | 'rejected';
  payment_preference?: 'monthly' | 'cumulative';
  created_at: string;
  guardians: Guardian[];
}

/** Admin self-service: register a student + create/link the parent account. */
export interface AdminStudentRegisterPayload {
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
  other_parent?: GuardianInput | null;
}

export interface AdminStudentRegisterResponse {
  student: Student;
  parent: {
    id: string;
    email: string;
    full_name: string;
    role: string;
    is_active: boolean;
  };
  /** Set only when a NEW parent account was created — display once to the admin. */
  temporary_password: string | null;
}

/** Parent-facing registration fee for a child's grade + current year. */
export interface RegistrationFeeResponse {
  configured: boolean;
  amount: number;
  paid: boolean;
}

export interface AdditionalCharge {
  id: string;
  student_id: string;
  grade_id: string | null;
  charge_type: string;
  description: string;
  amount: number;
  academic_year: number;
  month: number;
  is_paid: boolean;
  created_at: string;
}

export interface Payment {
  id: string;
  student_id: string;
  amount: number;
  payment_method: string;
  payment_date: string;
  reference_number: string | null;
  status: 'pending' | 'verified' | 'rejected' | 'reversed';
  allocated_by: string | null;
  notes: string | null;
  created_at: string;
}

export interface PaymentAllocation {
  id: string;
  payment_id: string;
  outstanding_balance_id: string | null;
  additional_charge_id: string | null;
  amount_allocated: number;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  payment_id: string;
  student_id: string;
  amount: number;
  payment_method: string;
  allocated_by: string;
  created_at: string;
}

export interface Statement {
  id: string;
  student_id: string;
  academic_year: number;
  month: number;
  opening_balance: number;
  total_fees: number;
  total_installments: number;
  total_additional_charges: number;
  total_payments: number;
  closing_balance: number;
  current_amount_due: number;
  due_date: string;
  generated_at: string;
}

export interface OutstandingBalance {
  id: string;
  student_id: string;
  monthly_schedule_id: string;
  original_amount: number;
  rollover_amount: number;
  amount_paid: number;
  balance: number;
  status: 'pending' | 'partial' | 'paid';
}

export interface MonthlySchedule {
  id: string;
  fee_structure_id: string;
  month: number;
  academic_year: number;
  amount_due: number;
  due_date: string;
  is_paid: boolean;
}

export interface MonthlyIncomeReport {
  period: string;
  total_income: number;
  payment_count: number;
}

export interface MonthlyOwingStudent {
  student_id: string;
  student_number: string;
  name: string;
  grade: string;
  balance: number;
}

export interface MonthlySummaryReport {
  academic_year: number;
  month: number;
  total_income: number;
  payment_count: number;
  outstanding_total: number;
  students_owing: number;
  students_owing_list: MonthlyOwingStudent[];
}

export interface InvoiceItem {
  type: 'opening' | 'fee' | 'charge';
  description: string;
  amount: number;
}

export type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'void';

export interface Invoice {
  id: string;
  invoice_number: string;
  student_id: string;
  academic_year: number;
  month: number;
  issue_date: string;
  due_date: string;
  subtotal: number;
  amount_paid: number;
  balance_due: number;
  status: InvoiceStatus;
  items: InvoiceItem[];
  created_by: string;
  created_at: string;
}

export interface OutstandingReport {
  academic_year: number;
  students_with_outstanding: number;
  students: {
    student_id: string;
    student_number: string;
    name: string;
    outstanding: number;
  }[];
}

export interface PaymentTrendsReport {
  academic_year: number;
  trends: { month: number; total: number }[];
}

export interface CarryForwardItem {
  student_id: string;
  student_number: string;
  name: string;
  grade: string;
}

export interface CarryForwardOutstanding extends CarryForwardItem {
  balance: number;
}

export interface CarryForwardReport {
  academic_year: number;
  month: number;
  not_paid_count: number;
  not_paid: CarryForwardItem[];
  outstanding_count: number;
  outstanding: CarryForwardOutstanding[];
}

export interface MonthSummary {
  month: number;
  amount_required: number;
  amount_paid: number;
  outstanding: number;
  status: 'paid' | 'partial' | 'pending' | 'none';
}

export interface StudentSummary {
  student_id: string;
  academic_year: number;
  total_required: number;
  total_paid: number;
  total_outstanding: number;
  months: MonthSummary[];
}

// ── Notification settings (admin scaffold — email/SMS channels) ──
export interface EmailSettings {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  /** NEVER returned by the API — blank/'********' on save keeps the stored secret */
  password?: string;
  password_set: boolean;
  from_email: string;
  from_name: string;
  use_tls: boolean;
}

export interface SmsSettings {
  enabled: boolean;
  provider: string;
  /** NEVER returned by the API — blank/'********' on save keeps the stored secret */
  api_key?: string;
  api_key_set: boolean;
  api_secret?: string;
  api_secret_set: boolean;
  sender_id: string;
}

export interface NotificationSettings {
  email: EmailSettings;
  sms: SmsSettings;
  email_ready: boolean;
  sms_ready: boolean;
}

export interface ReminderSettings {
  enabled: boolean;
  start_date: string;
  interval_days: number;
  count: number;
  last_run_date: string | null;
  next_run_date: string | null;
}

export interface ReminderRunResult {
  sent: number;
  skipped_no_phone: number;
  skipped_failed: number;
  errors: string[];
}

export interface SmsTemplate {
  key: string;
  name: string;
  body: string;
  is_active: boolean;
  updated_at: string;
}

export interface SmsTemplateRenderResult {
  key: string;
  content: string;
  missing: string[];
}

// ── In-app notifications (staff) ─────────────────────────────
export type NotificationCategory =
  | 'payment_received'
  | 'parent_registered'
  | 'student_applied'
  | 'payment_reversed'
  | 'system';

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  category: NotificationCategory;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: AppNotification[];
  total: number;
  unread: number;
}

export interface UnreadCountResponse {
  count: number;
}
