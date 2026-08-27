export interface User {
  id: string;
  email: string;
  full_name: string;
  phone?: string | null;
  role: 'admin' | 'finance' | 'parent' | 'super_admin';
  is_active: boolean;
}

export interface GuardianInput {
  first_name?: string;
  last_name?: string;
  full_name?: string;
  guardian_id?: string;
  phone?: string;
  email?: string;
  physical_address?: string;
  po_box?: string;
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

export interface InvoiceItem {
  type: 'opening' | 'fee' | 'charge';
  description: string;
  amount: number;
}

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
  status: 'draft' | 'issued' | 'paid' | 'void';
  items: InvoiceItem[];
  created_by: string;
  created_at: string;
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

export interface RegistrationFeeResponse {
  configured: boolean;
  amount: number;
  paid: boolean;
}

export interface NextDueDateResponse {
  student_id: string;
  student_name: string;
  next_due_date: string | null;
  next_month: number | null;
  next_amount_due: number;
  next_description: string;
  total_outstanding: number;
}

export interface PageResponse<T> {
  items: T[];
  page: number;
  page_size: number;
  total_pages: number;
  total: number;
  has_next_page: boolean;
  has_previous_page: boolean;
}
