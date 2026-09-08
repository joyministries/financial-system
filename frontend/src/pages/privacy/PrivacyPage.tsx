import { Link } from 'react-router-dom';
import BrandMark from '@/components/Brand';

/**
 * Public Privacy Policy — required by the Google Play Console "Data safety"
 * declaration and by POPIA. The contact email is configurable through
 * VITE_SCHOOL_CONTACT_EMAIL and should be set to the school's real address
 * before the app is submitted to review.
 */
const CONTACT_EMAIL =
  (import.meta.env.VITE_SCHOOL_CONTACT_EMAIL as string | undefined) ||
  'info@lambtonchristianschool.co.za';

const SECTIONS = [
  {
    title: '1. Who we are',
    body: 'Lambton Christian School ("we", "us", "the school") operates a parent finance portal and mobile app so that parents can pay school fees, view invoices, receipts and statements, and stay informed about payments. This policy explains what personal information we collect and how we handle it, in line with the Protection of Personal Information Act (POPIA) of South Africa.',
  },
  {
    title: '2. What we collect',
    body: 'When you register or use the portal we collect: your name and email address; your phone number if you provide it; the names and details of the learners linked to your account; and the payment and fee records associated with those learners (invoices, charges, receipts, statements and payment history).',
  },
  {
    title: '3. Why we collect it',
    body: 'We process this information to manage school fees and accounts, issue invoices, receipts and statements, process payments through our payment provider, communicate with you about your account, and meet our legal and audit obligations. Our legal bases are the performance of the enrolment contract, your consent where we ask for it, and legal obligations that apply to schools.',
  },
  {
    title: '4. Who we share it with',
    body: 'We share the minimum necessary data (names, amount, payment reference) with our payment processor, PayFast, solely to process a payment you initiate. We do not sell personal information, and we do not share it with any other third party except where the law requires it.',
  },
  {
    title: '5. How long we keep it',
    body: 'Your account profile is kept for as long as your learner is enrolled or your account is active. Financial records — invoices, payments, receipts and statements — are kept for the period required by South African law for accounting, audit and tax purposes, even if your account is deleted.',
  },
  {
    title: '6. Your rights',
    body: 'You may ask us to access, correct or delete your personal information. You can update your own details in the portal profile page, and you can request deletion of your account and personal data at any time using the data deletion form. If you are unhappy with how we have handled your information you may also lodge a complaint with the Information Regulator (South Africa).',
  },
  {
    title: '7. Security',
    body: 'We protect your information with encryption in transit, hashed passwords, access controls that limit staff to what their role requires, and audit logging of sensitive actions. Financial data is stored in a restricted database rather than on your device.',
  },
  {
    title: '8. Contact',
    body: 'For any question about this policy or your personal information, contact the school office or the Information Officer.',
  },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 text-lg" />
            <div>
              <p className="font-display text-base font-bold leading-tight text-slate-900">
                Lambton Christian School
              </p>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-600">
                Finance Portal
              </p>
            </div>
          </div>
          <Link to="/login" className="btn btn-outline">Sign in</Link>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-card">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
          <p className="mt-1 text-sm text-slate-500">Last updated: 8 September 2026</p>

          <div className="mt-6 space-y-6">
            {SECTIONS.map((s) => (
              <section key={s.title}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.body}</p>
              </section>
            ))}

            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">Contact details</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                School office:{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary-600 hover:text-primary-700">
                  {CONTACT_EMAIL}
                </a>
                <br />
                Data deletion requests:{' '}
                <Link to="/data-deletion" className="font-medium text-primary-600 hover:text-primary-700">
                  request deletion
                </Link>
              </p>
            </section>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} Lambton Christian School. All rights reserved.
        </p>
      </div>
    </div>
  );
}