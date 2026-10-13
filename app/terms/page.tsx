import { LegalPage } from "@/components/legal/legal-page";

export const metadata = { title: "Terms of Service · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="October 8, 2026">
      <p>
        These terms govern your use of the GRANBY COLLEGES OF SCIENCE & TECHNOLOGY Scheduling Management System (&quot;the System&quot;) operated by
        GRANBY COLLEGES OF SCIENCE &amp; TECHNOLOGY.
      </p>
      <h2>1. Eligibility and accounts</h2>
      <p>
        The System is for GRANBY COLLEGES OF SCIENCE & TECHNOLOGY students, faculty, and staff. You are responsible for keeping your credentials
        confidential and for all activity under your account. Notify the administrator immediately of any
        unauthorized use.
      </p>
      <h2>2. Acceptable use</h2>
      <ul>
        <li>Use the System only for legitimate academic and administrative purposes.</li>
        <li>Do not attempt to access data or functions beyond your assigned role.</li>
        <li>Do not interfere with the System&apos;s security or availability.</li>
      </ul>
      <h2>3. Schedules and data accuracy</h2>
      <p>
        Schedules generated or suggested by the System, including AI-assisted results, are subject to review and
        approval by authorized staff. Official schedules are those published by the Registrar.
      </p>
      <h2>4. Suspension</h2>
      <p>Accounts that violate these terms may be suspended or deactivated by an administrator.</p>
      <h2>5. Changes</h2>
      <p>These terms may be updated. Continued use of the System after changes constitutes acceptance.</p>
    </LegalPage>
  );
}
