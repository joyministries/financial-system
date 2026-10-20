import { Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import AuthLayout from '@/components/auth/AuthLayout';

export default function PaymentSuccessPage() {
  const params = new URLSearchParams(window.location.search);
  const paymentId = params.get('payment_id') ?? '';

  return (
    <AuthLayout>
      <div className="rounded-xl border border-line bg-white p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto h-14 w-14 text-[#1c7a4f]" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight text-ink">Payment successful</h1>
        <p className="mt-2 text-sm text-muted">
          Your payment was received. A receipt, confirmation email and SMS will follow shortly.
        </p>
        {paymentId && (
          <p className="mt-3 rounded-lg bg-[#faf8f2] px-4 py-2 text-xs text-muted">
            Payment reference: <span className="font-mono">{paymentId}</span>
          </p>
        )}
        <div className="mt-6 flex flex-col gap-3">
          <Link
            to="/parent"
            className="rounded-xl bg-primary-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-primary-800"
          >
            Back to my dashboard
          </Link>
          <Link
            to="/receipts"
            className="rounded-xl border border-[#d8d2c4] px-4 py-2.5 text-sm font-semibold text-body transition hover:bg-[#fdfbf5]"
          >
            View receipts
          </Link>
        </div>
      </div>
    </AuthLayout>
  );
}
