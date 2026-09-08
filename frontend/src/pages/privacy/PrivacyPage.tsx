import { Link } from 'react-router-dom';
import BrandMark from '@/components/Brand';

/**
 * Public Privacy Policy — required by the Google Play Console "Data safety"
 * declaration and by POPIA. Contact email is configurable through
 * VITE_SCHOOL_CONTACT_EMAIL and should be set to the school's real address
 * before the app is submitted to review.
 */
const CONTACT_EMAIL =
  (import.meta.env.VITE_SCHOOL_CONTACT_EMAIL as string | undefined) ||
  'info@lambtonchristianschool.co.za';

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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Privacy and Data Protection Policy
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-600">Effective Date: September 8, 2026</p>
          <p className="text-sm text-slate-500">Organization: Lambton Christian School</p>

          <div className="mt-6 space-y-6">
            {/* 1. Introduction and Scope */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                1. Introduction and Scope
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Lambton Christian School ("we," "our," or "us") is committed to protecting the
                privacy and security of all personal and financial data processed through our
                financial management system. This Privacy and Data Protection Policy applies to
                all users of the platform, including school administrators, bursars, parents,
                guardians, and students. By accessing or using our financial application, you
                acknowledge and agree to the practices described in this document.
              </p>
            </section>

            {/* 2. Information We Collect */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                2. Information We Collect
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                To automate student registration, tuition fee tracking, and statistical
                reporting, our system collects and processes specific categories of data:
              </p>
              <div className="mt-3 table-wrap">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="th">Data Category</th>
                      <th className="th">Specific Elements Collected</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    <tr>
                      <td className="td font-medium text-slate-900">Student Identifiers</td>
                      <td className="td text-slate-600">
                        Student names, admission numbers, class/grade levels, and academic enrollment details.
                      </td>
                    </tr>
                    <tr>
                      <td className="td font-medium text-slate-900">Payer & Guardian Information</td>
                      <td className="td text-slate-600">
                        Parent or guardian names, contact phone numbers, and email addresses.
                      </td>
                    </tr>
                    <tr>
                      <td className="td font-medium text-slate-900">Financial & Transaction Records</td>
                      <td className="td text-slate-600">
                        Bank transaction codes, reference numbers, invoice balances, payment history, and fee allocations.
                      </td>
                    </tr>
                    <tr>
                      <td className="td font-medium text-slate-900">System & Technical Logs</td>
                      <td className="td text-slate-600">
                        User login timestamps, IP addresses, and administrative audit trails for security monitoring.
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 3. Purpose and Use of Data */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                3. Purpose and Use of Data
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                We process personal and financial data exclusively for authorized educational and
                administrative purposes:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-slate-600">
                <li>
                  Facilitating school billing, fee tracking, and financial reconciliation
                  obligations to parents and guardians.
                </li>
                <li>
                  Maintaining statutory accounting records and complying with educational and
                  financial regulatory authorities.
                </li>
                <li>
                  Securing the application against fraud, unauthorized access, and ensuring
                  system reliability.
                </li>
              </ul>
            </section>

            {/* 4. Strict Purpose Limitation */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                4. Strict Purpose Limitation
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                We enforce strict operational boundaries regarding data usage:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-slate-600">
                <li>
                  Financial and student records processed within the system are never utilized for
                  commercial profiling, targeted advertising, or marketing purposes.
                </li>
                <li>
                  Data is shared strictly with authorized personnel within the school based on
                  strict role-based access permissions.
                </li>
              </ul>
            </section>

            {/* 5. Data Security Measures */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                5. Data Security Measures
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Protecting sensitive financial and student data is a core priority. Our technical
                safeguards include:
              </p>
              <ul className="mt-2 list-inside list-disc space-y-1.5 text-sm leading-relaxed text-slate-600">
                <li>End-to-end encryption for data in transit using HTTPS/TLS protocols.</li>
                <li>
                  Encrypted database storage for sensitive transaction references and user credentials.
                </li>
                <li>
                  Strict role-based access control (RBAC) ensuring that only authorized school
                  staff (such as bursars and principals) can view or modify specific ledger entries.
                </li>
                <li>
                  Regular system maintenance and automated security logging to detect and prevent
                  unauthorized access attempts.
                </li>
              </ul>
            </section>

            {/* 6. Data Retention and Disposal Policy */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                6. Data Retention and Disposal Policy
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Financial records and student data are retained only as long as necessary to
                fulfill the educational and administrative purposes for which they were collected,
                or to comply with statutory financial auditing timelines. Once retention periods
                expire, data is securely purged or anonymized using industry-standard deletion
                protocols.
              </p>
            </section>

            {/* 7. User Rights */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                7. User Rights
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Under applicable data privacy regulations, data subjects have the right to:
              </p>
              <ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm leading-relaxed text-slate-600">
                <li>
                  <span className="font-medium text-slate-700">Access:</span> Request confirmation
                  on whether their personal data is being processed and obtain a copy of their
                  financial records.
                </li>
                <li>
                  <span className="font-medium text-slate-700">Rectification:</span> Request
                  corrections to inaccurate billing details, student names, or contact information
                  through the school administration.
                </li>
                <li>
                  <span className="font-medium text-slate-700">Objection &amp; Restriction:</span>{' '}
                  Raise inquiries or complaints regarding data handling practices by contacting the
                  school administration.
                </li>
              </ol>
            </section>

            {/* 8. Policy Updates */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                8. Policy Updates
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                We may update this Privacy and Data Protection Policy periodically to reflect
                enhancements or changes in legal requirements. Material updates will be
                communicated through system notifications or directly to users.
              </p>
            </section>

            {/* 9. Contact Information */}
            <section>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                9. Contact Information
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                For any questions, concerns, or requests regarding this policy or system security,
                please reach out directly to the Lambton Christian School administration office.
              </p>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                School office:{' '}
                <a href={`mailto:${CONTACT_EMAIL}`} className="font-medium text-primary-600 hover:text-primary-700">
                  {CONTACT_EMAIL}
                </a>
                <br />
                Data deletion requests:{' '}
                <Link to="/data-deletion" className="font-medium text-primary-600 hover:text-primary-700">
                  request deletion of your personal data
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