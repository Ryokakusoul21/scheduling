import { LegalPage } from "@/components/legal/legal-page";

export const metadata = { title: "Privacy Policy · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 8, 2026">
      <p>
        GRANBY COLLEGES OF SCIENCE & TECHNOLOGY processes personal data in the System in accordance with the Data Privacy Act of 2012 (Republic Act
        No. 10173).
      </p>
      <h2>Information we collect</h2>
      <ul>
        <li>Account details: name, email address, role, and a securely hashed password.</li>
        <li>Academic data needed for scheduling: enrolled sections, teaching loads, and availability.</li>
        <li>Security logs: sign-in attempts, IP addresses, and an audit trail of changes.</li>
      </ul>
      <h2>How we use it</h2>
      <p>
        To authenticate you, build and publish class schedules, send account and schedule notifications, and protect
        the System against misuse.
      </p>
      <h2>Sharing</h2>
      <p>
        Data is accessible only to authorized GRANBY COLLEGES OF SCIENCE & TECHNOLOGY personnel according to their role. Optional artificial intelligence features may send
        schedule data (not passwords) to an artificial intelligence service provider to generate suggestions.
      </p>
      <h2>Retention and your rights</h2>
      <p>
        You may request access to, correction of, or deletion of your personal data by contacting the GRANBY COLLEGES OF SCIENCE & TECHNOLOGY Data
        Protection Officer through the Registrar&apos;s Office.
      </p>
    </LegalPage>
  );
}
