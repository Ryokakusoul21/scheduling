import Forbidden from "../forbidden";

export const metadata = { title: "Access Denied · GRANBY COLLEGES OF SCIENCE & TECHNOLOGY" };

/** Target of the proxy's RBAC rewrite (served with HTTP 403). */
export default function ForbiddenPage() {
  return <Forbidden />;
}
