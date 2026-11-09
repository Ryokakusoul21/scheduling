/** Sample accounts from the seed: shown as sign-in shortcuts in development and in the Super Administrator's View as page. */

export interface DemoAccount { label: string; email: string; sees: string }

export const DEMO_STAFF: DemoAccount[] = [
  { label: "Super Administrator", email: "superadministrator@granby.edu.ph", sees: "Everything, plus user accounts, system settings, and audit logs." },
  { label: "Registrar", email: "registrar@granby.edu.ph", sees: "Every department, term, room, schedule, examination, calendar, and report; views timetables but does not approve them." },
  { label: "Head of Department", email: "head.computing@granby.edu.ph", sees: "Builds and submits department timetables, manages department faculty, subjects, and rooms, and teaches own classes." },
  { label: "Faculty (overloaded)", email: "faculty@granby.edu.ph", sees: "Own schedule and teaching load above the maximum; books rooms and reports unavailability." },
  { label: "Faculty (underloaded)", email: "alonzo@granby.edu.ph", sees: "Own schedule and teaching load below the minimum; books rooms and reports unavailability." },
];

export const DEMO_STUDENTS: DemoAccount[] = [
  { label: "Senior High School student", email: "student.stem@granby.edu.ph", sees: "Own section timetable, room assignments, and school activities; view and print only." },
  { label: "College student", email: "student.college@granby.edu.ph", sees: "Own section timetable, room assignments, and school activities; view and print only." },
];
