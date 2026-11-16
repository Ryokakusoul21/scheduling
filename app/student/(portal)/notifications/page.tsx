import { redirect } from "next/navigation";

/** Keep old bookmarks working after removing the student inbox. */
export default function RetiredStudentNotificationsPage() {
  redirect("/student");
}
