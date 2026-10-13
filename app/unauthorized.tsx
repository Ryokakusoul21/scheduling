import { StatusPage } from "@/components/errors/status-page";

export const metadata = { title: "Sign In Required · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

export default function Unauthorized() {
  return (
    <StatusPage
      code={401}
      title="Sign in required"
      description="You need to be signed in to view this page. Your session may have expired or been signed out from another device."
      action={{ href: "/login", label: "Sign in" }}
    />
  );
}
