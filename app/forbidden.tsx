import { StatusPage } from "@/components/errors/status-page";

export const metadata = { title: "Access Denied · GCST Scheduling" };

export default function Forbidden() {
  return (
    <StatusPage
      code={403}
      title="Access denied"
      description="Your account doesn't have permission to access this page. If you think this is a mistake, contact the system administrator."
      action={{ href: "/dashboard", label: "Back to dashboard" }}
    />
  );
}
