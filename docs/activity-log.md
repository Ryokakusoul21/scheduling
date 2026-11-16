# Activity Log

## 2026-11-14 - Supplied computing curricula imported

- Replaced First Semester, Academic Year 2026-2027 computing curricula from subjects_BSCS.png and subjects_BSIT.png: Computer Science has 25 subject rows and four sections; Information Technology has 24 rows and 21 sections. Shared codes are stored once (38 distinct subjects).
- Unit totals by year match the sources: Computer Science 23/20/24/9; Information Technology 23/23/18/9. Lecture and laboratory hours remain zero for later setup, as requested. Existing section counts of students and enrollment links are preserved; new sections start with zero students.
- Archived 137 superseded class meetings, six examinations, and 61 faculty assignments. Prior records and links remain stored; a local pre-import snapshot is in uploads/curriculum-backups/.
- Added a repeatable import with preview and verification modes in scripts/replace-computing-curriculum.mts; the seed applies the same source data. Explicit program sharing now controls curriculum lists and scheduler subject choices.
- Validation: all 568 tests, typecheck, lint, source totals, section ranges, and database isolation checks passed. Unrelated schedules, sections, and student section links are unchanged.

## 2026-11-14 - Faculty profile dialog redesign

- Replaced the narrow read-only field list with a 640px profile dialog: avatar, position, employee ID, status, full-width department, teaching overview, workload, and employment details.
- Omitted empty details and full-time day-off fields. Added a Registrar update note, Close, and View timetable actions; mobile content scrolls above a persistent footer.
- Faculty editing permissions and administrative forms remain unchanged.

## 2026-11-14 - Faculty information read-only for Heads of Department

- Faculty cards and rows open read-only details for Heads of Department; create, edit, archive, and the add shortcut are hidden. Room preferences and timetable access remain available.
- Faculty create and update actions enforce the existing central permission policy before accessing records, including direct requests. Registrar and Super Administrator editing remains available.
- Regression coverage checks blocked Head of Department requests and preserved administrative editing.

## 2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler)

### Decisions (confirmed with the user)
- Roles collapse to Administrator, Head of Department, Faculty. Old Scheduler maps to Head of Department; Super Administrator and Registrar map to Administrator; Student accounts are deactivated (migration `20261013090000_full_feature_set`).
- All academic levels stay (Elementary, Junior High, Senior High, College).
- AI features use in-house algorithms; Gemini adds an optional narrative when `GEMINI_API_KEY` is set.
- Database was reset and reseeded with user consent. Prisma 7 `migrate reset` does not run the seed; run `npx prisma db seed` afterwards.

### Design notes
- Head of Department scope = department of their linked faculty record (`lib/permissions/scope.ts`). Rooms gained an optional owning department; shared rooms are Administrator-managed.
- Room bookings and automatic adjustments are dated: `ScheduleAdjustment` overrides one meeting of a weekly class (MOVED, CANCELLED, MAKE_UP) and belongs to an `AdjustmentBatch` that can be undone as a whole.
- `lib/occupancy/engine.ts` is the shared pure engine: expands weekly classes into dated sessions, detects clashes, finds the nearest room/time/substitute, and proposes make-up slots.
- Seed dates are computed from the day it runs, so the active term and calendar are always current.
- Program and subject codes (BSIT, IT101) are kept as catalog identifiers; all display labels use full words.

### Progress (all done, 11 commits 773d893..6e2b15b)
- [x] Roles, navigation, route guards, user-to-faculty linking, settings (teaching load limits)
- [x] Schema, migration, seed, occupancy engine with tests
- [x] Server-side double-booking prevention in Scheduler (`weeklyDoubleBooking`)
- [x] Examinations (`/examinations`)
- [x] Calendar of Activities (`/calendar`)
- [x] Room Booking with automatic conflict resolution and undo (`/bookings`)
- [x] Bulk import with template, validation, preview (`/import`)
- [x] Timetable Analytics (`/analytics`); old room-utilization and faculty-workload report pages removed
- [x] Workload optimization with approval (`/workload`, `lib/workload/optimizer.ts`)
- [x] Dynamic schedule adjustment (`/adjustments`) and unavailability reports (`/availability`)
- [x] Enrollment forecasting (`/forecast`, `lib/forecast`)
- [x] Export, role dashboards, Head of Department scoping, abbreviation sweep

### Verification
- 61 unit tests pass (`npm test`); `next build` passes; lint clean.
- Scripted against the seeded database: booking moves classes to the nearest room, faculty unavailability finds substitutes, suspension plus make-up plus undo round-trip, optimizer and forecast outputs.
- Production smoke test: every page returns without errors for all three demo roles; forbidden pages show Access Denied.

### Gotchas
- `next start` locally needs `AUTH_TRUST_HOST=true` (Auth.js UntrustedHost otherwise).
- A stale 308 redirect `/calendar -> /scheduler` was removed from next.config.ts; browsers that cached it need a cache clear.
- Sections without a program (Junior High, Elementary) and general education subjects are Administrator-managed only.
- The global minimum load (12 hours) flags many sample faculty as underloaded because basic education has only small sample timetables.

## 2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5)

### What changed
- `lib/workload/auto.ts`: every load-changing action calls `queueWorkloadCheck(trigger)` (runs after the response via `after()`, serialized). Mode in the `workload` setting: `APPROVAL` (default, one automatic proposal per department, replaced only when the moves change) or `AUTOMATIC` (applied at once).
- Every applied move is a `WorkloadFix` row (both loads before and after, reason, trigger, time) and can be undone; undone fixes and rejected automatic proposals block that class from automatic moves (otherwise the optimizer re-fixed with another receiver).
- Classes of inactive or on-leave faculty are reassigned or flagged; flags live in the `workloadStatus` setting.
- `/api/data-version` + `components/ux/live-refresh.tsx`: pages poll a fingerprint every 5 seconds and `router.refresh()` on change.
- `lib/analytics/dashboard.ts` + `components/dashboard/admin-*`: Administrator analytics with previous-semester comparison, filters in the URL, export.
- `prisma/sample-timetable.ts` (shared generator) and `prisma/sample-history.ts` (previous semester and past bookings through the real planner). Seed now runs with `--conditions=react-server`.

### Gotchas
- Previous-semester comparison only exists where a previous term of the same level has classes; sample history adds Second Semester 2025-2026 for College.
- During engine testing a class moved twice (A to B to C) so its undo was refused; restored from the deterministic seed assignment. Test cleanup must undo fixes before deleting them.
- Administrator dashboard renders in about 4 seconds against the remote Supabase database (many round trips); live refreshes rerun it.

## 2026-10-14 - Role dashboards (commit 752bf31)
- `components/dashboard/kit.tsx` is the shared design (StatCard, ChangeBadge, DashboardToolbar with semester filter, export, live refresh); all three dashboards use it.
- Head of Department: `HeadDashboard` in `components/dashboard/role-dashboards.tsx`; `?view=department|mine`. Department id always comes from the scope, never the address.
- Faculty: `lib/analytics/faculty.ts` reads only the signed-in faculty member's own data; the department comparison is an average.
- Old faculty and Head of Department overview, `MyTeaching`, and DailyStat trend recording removed (the DailyStat table is unused now).
- Report Unavailability previews impact via `planFacultyUnavailable` without naming substitutes.
- Demo accounts: faculty@ (Ana Santos, overloaded), alonzo@ (Mika Alonzo, underloaded); the College of Computer Studies is the overloaded department.

## 2026-10-16 - Printing, constraints, room designation, Student role

### Decisions (confirmed with the user)
- Student role added back as a fourth, view-only role with separate /student/* authentication pages; CLAUDE.md User Roles updated.
- Constraints run on save, drag move, suggestions, and automatic adjustments, plus a whole-term report; no full automatic generator.
- Existing rooms default to General / Shared.
- Migration applied and the development database reset and re-seeded with consent.

### What changed
- `lib/export/report.ts`: printable report document (hidden iframe, own `@media print` sheet, `@page` landscape for timetables, repeated header row, rows never split) and CSV with the same header lines. `ReportButtons` and wrappers in `components/ux/export-buttons.tsx`.
- Print/PDF/spreadsheet on scheduler section, teacher, and room timetables; calendar activities; room information list; student portal.
- `lib/scheduler/constraints.ts` (pure checker) and `constraints-server.ts`; `SchedulingConstraint` table; `/constraints` manager. Hard violations block save and move; soft violations return `overridable` and the scheduler asks "Override and save" (overrides are audit-logged). Double-booking is always on (locked).
- Room designation: `Room.isGeneralShared` + many-to-many `programs`; honored by suggestions (`rankRooms`) and the adjustment engine (`roomSuits`).
- Back button in the scheduler (`components/ux/back-button.tsx`); unsaved = open class dialog or saves in flight.
- Student: `Role.STUDENT`, `Student` table (student number unique, optional section with SET NULL). `requireUser()` now rejects students; `requireStudent()` guards the portal. Proxy keeps students inside /student and staff out of it. Credentials carry `portal`; a wrong portal fails like a wrong password.

### Gotchas
- Basic-education sections have no semester; the portal and registration resolve their terms by level.
- `sendVerification` lives in `lib/auth/verification.ts` so it is not callable as a server action.
- Prisma blocks `migrate reset` from agents without explicit user consent text.
- Demo students: student.stem@ (Grade 11 - Newton), student.college@ (Information Technology 1-A), password as other demo accounts.

## 2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities

### Decisions (confirmed with the user)
- Migration `20261021090000_archive_and_activity_approvals` applied; development database reset and reseeded with consent.
- Only Heads of Department submit activities for approval (Faculty stay view-only); Administrator activities are approved at once.
- Archiving a faculty user account also archives its faculty record (and the reverse); restoring brings both back.
- The Faculty page archives too, like subjects, rooms, and sections.

### Design notes
- `archivedAt`, `archivedById`, `archiveReason` on User, Faculty, Subject, Room, Section. `lib/archive/archive.ts` (`setArchived`, `activeClassesOf`), `actions/archive.ts` (archive with class warning, restore), `components/ux/archive-button.tsx`, Archived tab at `/admin/users/archived`.
- Archived users are blocked at login and in the session check (`auth.ts`); archived records are filtered from choice lists, analytics, forecast, search, notifications; history pages and name lookups keep them.
- Scheduler keeps archived records in its data (flag `archived`, faculty status "ARCHIVED") so existing classes still display, but pickers and suggestions skip them; `saveClassAction` refuses newly assigning archived records.
- Archived faculty count as inactive in `lib/workload/load.ts`, so archiving with classes runs workload balancing and proposes reassignments.
- `Activity` gained department, school level, room, location, participants, `status` (ActivityStatus), review fields. `lib/activities/activities.ts`: `visibleActivities` (role scope), `listActivities`, `activityConflicts` (occupancy plan, capped at 31 days per activity).
- Only APPROVED holidays cancel classes (`lib/occupancy/load.ts`); dashboards and the student portal show APPROVED only.
- Calendar page tabs: Calendar, Table, Activity Approvals (Administrator). Pending items: dashed faded style.
- Report export supports extra tables (`ReportDoc.extra`, `reportSection`); `ACTIVITY_COLUMNS` shared. `lib/reports/affected.ts` marks classes on holiday, suspension, or activity days (tests/report-affected.test.ts).

### Gotchas
- `prisma migrate reset` needs PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION with the user's consent; then run `npx prisma db seed`.
- Demo: head.business@ (Ricardo Lim) and head.artsciences@ (Daniel Ramos) added; archived samples in `prisma/sample-archive-activities.ts`.
- Browser click-through of the new dialogs was not done (extension not connected); server flows verified with scripts and page fetches.

## 2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user)

### Decisions (confirmed with the user)
- Building photo upload with an illustrated fallback; new building fields location, purpose, opening and closing time (migration `20261021100000_building_details`); status computed from room statuses.
- Clicking a card opens `/rooms/[buildingId]`; no campus map.
- Existing database updated in place (building details and Main Building photo) instead of another reset.

### Design notes
- `/rooms` = `buildings-overview.tsx`: stat cards, search (names, codes, locations, and room text), purpose and status filters, sort, grid and list layouts (drag reorder in list view with custom order), card menu (edit, photo, delete), room information export.
- `/rooms/[buildingId]` = `building-banner.tsx` + `RoomsExplorer` (now one building's floors and rooms).
- Shared: `lib/rooms/rooms.ts` (types, labels), `lib/rooms/buildings.ts` (purposes, status, hours, photo address), `lib/rooms/load.ts` (server loader, omits photo bytes), `components/rooms/building-art.tsx`.
- Photos: resized to 1600 px JPEG in the browser, stored in `Building.photo` (max 1.5 MB), served by `app/(dashboard)/rooms/[buildingId]/photo/route.ts` (staff only, cache keyed by `photoUpdatedAt`). `serverActions.bodySizeLimit` raised to 2 MB.
- Global search room results open the building page with the room number searched.

## 2026-10-29 - Head of Department scope, merged Scheduler (steps 1 to 3)

### Decisions (confirmed with the user)
- Development database reset and reseeded with consent; migration `20261029025632_hod_program_scope_exam_approval`.
- `HeadProgramAssignment` (userId, programId, isActing, startDate, endDate); department always derived from the program. Active rows restrict the head to those programs; none means the whole home department. Administrator manages them in User Management (`admin/users/program-actions.ts`), audited.
- Examinations follow the class flow: Draft, Submit for Approval (bulk listing), Administrator approves or rejects per row (reason required) in the Review Center. Only approved ones reach Faculty and Students.
- Work is staged: after step 3 stop for review; then Unscheduled changes, examination auto-schedule, tests.

### Design notes
- Policy: `programIds` on `PolicyUser`/`Scope`, `resolveProgramIds`, program-aware `can` and `scopeQuery`; `lib/permissions/section-access.ts` gives not-found vs readable refusal and logs blocked attempts.
- Scheduler page: scoped levels, terms, programs, sections; other departments' classes and examinations arrive only as anonymous busy blocks; all rooms listed (foreign flagged). `lib/scheduler/filter-scope.ts` sanitizes stale URL parameters and pre-selects single-value selectors.
- `/scheduler?mode=classes|examinations` with `ModeSwitch`; `/examinations` redirects (next.config); old page, manager, and actions removed. Examination mode: `exam-mode.tsx` (server loader), `exam-workspace.tsx`, `exam-actions.ts`, pure `lib/examinations/rules.ts`, `lib/examinations/context.ts` (windows and blocked dates from approved activities).
- Placeholders gained rememberedFacultyId, rememberedRoomId, preferredFacultyId (used in step 4).

### Gotchas
- Browser click-through not done (extension not connected); verified with tsc, eslint, vitest, and the redirect via curl.
- Seeded "Midterm Examination Day" event removed (it would block the examination date).

## 2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements)

### Findings
- "?" faculty in the Table view was not missing data: Schedule.facultyId is required. A Head of Department only receives own-department faculty, so General Education faculty of other departments had no name.

### Changes
- page.tsx sends outsideFaculty (id, name, department only) for faculty on visible classes; shown as "Name (Department)".
- lib/scheduler/summary.ts: sectionNeeds, allSectionNeeds, facultyNotAssigned (pure, tested in tests/scheduler-summary.test.ts).
- "Faculty not assigned" warning (empty, unknown, or archived faculty) in the Conflicts panel; Submit for Approval blocked client-side and server-side (archived faculty).
- Unscheduled tab totals all sections in the filter; with no section open it lists sections with counts that open the section.
- Constraints tab shows the violation count after a check; warnings jump to the class without forcing Timetable, and Table rows scroll, focus, and ring-highlight.

### Decisions (user)
- Soft-constraint thresholds (Phase 4) live as editable rules on the Scheduling Constraints page.
- Versions: snapshot before Auto-Schedule and bulk operations, keep last 20 per term, Head of Department own sections / Administrator all, restoring Published classes Administrator only.

### Gotchas
- tests/permission-policy.test.ts already fails from uncommitted permission work on this branch (GE subject scope), unrelated to Phase 1.
- Phase 1 files also carry earlier uncommitted work, so nothing was committed.

## 2026-10-30 Scheduler improvements, Phase 2

### Changes
- lib/scheduler/slot-check.ts: checkSlot (reasons: faculty, room, section busy; room type mismatch; faculty unavailable; outside allowed hours), slotMap, suggestRooms. Tests in tests/slot-check.test.ts.
- summary.ts durationMismatches: per section, subject, component, and term, plotted hours vs subject hours, shown as "Hours do not match subject".
- Timetable: unscheduled tray (unscheduled-tray.tsx) under the grid for an open section; while dragging, each slot start shows green (valid) or red striped (title lists reasons); preview label names the blocking reasons.
- Dropping an unscheduled class now validates and saves directly (note "Placed from the unscheduled tray."); faculty and room are picked once at drag start so highlights match the save. Falls back to the dialog when no faculty or room can be suggested.
- Room type mismatch warnings get "Suggest rooms" with "Use room" (free, correct lab type, enough seats, smallest first).

### Gotchas
- Allowed hours are the grid bounds (7:00 AM to 7:00 PM) plus room availability windows; Phase 6 may change the grid range.

## 2026-10-31 Login and dashboard redesign (UI only)

### Login
- AuthShell (shared by every sign-in, registration, and recovery page): gradient overlay over the campus photo, gold accent bar, three feature highlights, 55/45 split, compact branded header below lg.
- LoginForm: 48px inputs with icons, show/hide password, Caps Lock warning, dismissible polite alert, "Signing in…" state, demo accounts only outside production (collapsible, no password shown).
- Brand tokens `--brand-navy/blue/gold/link` in globals.css. The old `--gold` token is blue and still used by the sidebar, so it was left alone.

### Dashboard
- New widgets in components/dashboard/overview: kit (Section, KpiRow, AttentionList, skeletons, TONE), data (React cache loaders), sections (async server sections behind Suspense), pending-fixes, workload-chart, latest-fixes, recent-activity.
- Administrator: header, 4 KPIs, Needs attention (merged with workload flags) + Fixes awaiting approval, Faculty workload (top 10, filter chips, tooltips), Latest fixes + Today (classes and recent activity without sign-ins by default).
- Head of Department dashboard uses the same Fixes awaiting approval, Latest fixes, and workload sections. WorkloadBalance deleted; Faculty Workload page untouched.
- The Administrator data analytics block moved to /analytics?view=overview ("School overview" tab).
- Status tokens `--success/warning/danger/info` with dark variants.
- Reject now uses a dialog with a required reason instead of window.prompt.

### App shell
- Sidebar 248px, collapsible groups remembered in localStorage (group with the current page stays open), gold left accent on the active item, tooltips when collapsed, campus photo card removed. The mobile drawer reuses the same NavGroups.
- Top bar: school name removed, visible "/" search hint, tooltips and aria-labels on icon buttons, unread count badge.

### Gotchas
- "Faculty overloaded" now comes from the workload view (configured minimum and maximum), not faculty.maxHours as before, so it matches the chart.
- tests/permission-policy.test.ts fails on the in-progress department-scope changes in lib/permissions, unrelated to this pass.

## 2026-10-31 Scheduling Constraints redesign (UI only)

- Tabs by category (?tab=faculty|schedule|rooms) with counts, Required/Preferred legend, filter chips, title search.
- Category is derived on the frontend in app/(dashboard)/constraints/categories.ts. MAX_CONSECUTIVE and MINIMUM_GAP follow params.appliesTo (FACULTY goes to Faculty rules, SECTION to Schedule rules).
- Files: categories.ts (mapping, chips, defaults), rule-row.tsx (row, badges, status toggle, overflow menu), faculty-preferences.tsx (grouped by faculty, search, paging), constraint-dialog.tsx (category step first), manager.tsx (tabs, filters, optimistic toggle with Undo), loading.tsx.
- Duplicate reuses saveConstraintAction(null, ...). No action or schema changes.
- No weight or priority field exists, so Preferred rules show no Low/Medium/High.
- Settings chips use full words ("8 hours a day", "Day off: Saturday") per the no-abbreviations rule.
- Fixed a missing key warning on the Head of Department dashboard view toggle (server element passed into DashboardToolbar).

## 2026-10-31 Room Booking redesign (UI only)

- Split booking-workspace.tsx into search-form.tsx (inline validation, Enter in selects submits, End follows Start), room-results.tsx (summary, Free only or Show all, room cards), book-dialog.tsx (summary plus each class that will move, "Book and move class"), bookings-list.tsx (Upcoming and Past tabs, Export menu, cancel confirm), format.ts (readable dates, Manila clock), loading.tsx.
- findRoomsAction already returns the planned class moves per room, so the confirmation shows them before booking. bookRoomAction re-plans at booking time.
- page.tsx now computes past, readable dates, relative hints, and default date and start on the server so the first render matches.
- Dates are written out in full ("Wednesday, November 4, 2026") per the no-abbreviations rule.
- Not done (needs backend): room equipment on result cards (findRoomsAction does not return it), nearby alternative slots, and the room availability timeline (no per-room day occupancy endpoint for the client).

## 2026-10-31 Scheduler: Resolve issues

- Decisions: extend WorkloadProposal (kind, generatedAt, options, undoneAt), self-apply like manual edits, solver in a browser Web Worker with server re-validation on apply, "Check subject setup" when over-hours in 3+ sections or at least double.
- lib/scheduler/validate.ts: one validator composed of detectConflicts, checkSlot (allowed hours), and the constraint rules. Detector findings are hard for the solver.
- lib/scheduler/resolver/: types, issues (detect and count, issueFor), solver (hardest first, least-disruptive candidates, swap or displace one class, local backtracking, iteration and time limits, deterministic), changes (apply, revert, checkSelection, introducedHard), explain (templates and anonymized facts), client-input, server (world from the database).
- app/(dashboard)/scheduler/resolve-actions.ts: stamp, narrate (Gemini via narrate(), optional), apply (stale check, full re-validation, one transaction, proposal saved as SCHEDULE_REPAIR APPLIED, audit, faculty notified), undo.
- UI: Resolve issues button with count, per-section Resolve, per-finding Fix, Fix all of this type, options, progress with Cancel, review with checkboxes, preview overlay ("Proposed" dashed blocks), Undo toast. Panel tabs Conflicts, Unscheduled, Warnings, Constraints with counts; short section codes sorted by most unscheduled.
- Migration 20261031130000_schedule_repair_proposals applied to the database. Existing workload proposal queries now filter kind WORKLOAD.
- Gotcha: after a schema change, restart next dev; the running server keeps the old Prisma client.

## 2026-10-31 Speed pass

- Writes: Resolve issues apply and undo batch their writes (createMany, updateMany, one VALUES update) with a 60 second transaction limit. Batched too: workload applyMoves (prefetch, in-memory loads, one notification insert), room booking notifications (notifyFacultyEach), activity decisions (notifyEach), activity proposal approval, section generation, room import, examination approval notifications.
- Reads: session and scope cached per request (React cache), so layout, page, and streamed sections validate once. Scheduler page loads in three parallel rounds instead of about seven; Sections, workload view, and Head of Department dashboard queries run in parallel.
- Compile: next.config.ts modularizeImports loads single Phosphor icon files instead of the whole set (needs skipDefaultConversion because icon files have no default export).
- "Compiling..." in dev is on-demand route compilation; production (npm run build, npm run start) has none.

## 2026-10-31 Mobile and tablet pass (code review, no browser)

- Scheduler (classes and examinations) locks to the screen height only at lg and up; below that the page scrolls normally and the timetable scrolls sideways inside its box.
- Dialogs and alert dialogs: height capped at the screen with scrolling, side margin on phones.
- Toolbar selects and searches full width on phones (dashboard toolbar, analytics, forecast, subjects, faculty).
- Button and badge rows wrap (sections, subjects, export buttons, calendar event badges); examination period tabs scroll sideways.
- Already fine: shared Table (scrolls sideways), month calendar, heatmap, timetable, top bar and mobile drawer, pages redesigned earlier.

## 2026-11-01 Subject Assigning

- New `SubjectAssignment` model (subject, faculty, optional section, term, ACTIVE/ARCHIVED, assignedById); migration 20261101120000 adds a partial unique index on subject + section + term (NULLS NOT DISTINCT, active rows only).
- Term = `semesterId` (a Semester already belongs to an AcademicYear), so semester and school year cannot disagree.
- Subjects (Head of Department curriculum view): Assigned Faculty column, Assign/Reassign/Request assignment, Unassigned only chip, term picker, bulk select, unassigned count in the summary.
- Assign dialog: searchable faculty with department, employment type, load/limit; non-blocking warnings for load limit, department mismatch, reported unavailability; Remove assignment.
- Permissions reuse `canManageSubject`; General Education subjects go through the existing subject change request ("Request assignment"). A department without college programs (General Education) now sees every college curriculum in this view.
- Scheduler: class dialog lists only the assigned professor with a "Show all faculty" override and mismatch warning; auto-suggest picks the assigned professor.
- Workload: approved or automatic moves update assignments (`syncAssignmentsForMove`), undo reverts them; page shows "assigned, not yet scheduled" load.
- New /my-subjects page (Faculty and Head of Department) under My Teaching.
- Audit log and bell notifications on assign, reassign, remove, and import.
- Import template: optional Assigned Faculty column (email or employee ID), assigned for all sections in the active term.
- Seed derives assignments from scheduled college classes; current database backfilled with 83 rows (additive, no reseed).
- Known unrelated failure: tests/permission-policy.test.ts subject scope filter (pre-existing uncommitted policy change).

## 2026-11-01 Always-balanced workload with Head of Department approval

- Removed the AUTOMATIC workload mode: the check only proposes; nothing applies without approval.
- Settings: full-time and part-time ranges, maximum units, balance tolerance, cross-department policy (BOTH_HEADS default or DISALLOWED); old saved values fall back to defaults.
- Optimizer (single source of rules): per-type limits, unit cap, unscheduled SubjectAssignments count and move (key plan|id), phase 3 evens departments within tolerance, ranking = department, specialization, fewest moves, smallest class that fixes it, lowest imbalance; rejected rows block only that receiver; `validateRows` and `basisOf` for approval-time checks.
- New `WorkloadProposalItem` rows (PENDING/APPROVED/REJECTED/APPLIED, per-side approvers, edited flag); proposals gain `version` (optimistic lock), `basis` (stale detection), `reviewNote`; old pending JSON proposals superseded by the migration.
- `lib/workload/approval.ts` (pure permissions), `lib/workload/review.ts` (approve/reject/edit in one transaction, stale proposals superseded and regenerated, audit, notifications with old/new load and added/removed classes).
- Fixed: Head of Department could not approve (actions required ADMINISTRATOR); undo also allowed for Heads within their department.
- Enforcement: projected-load warnings in Assign dialog, Scheduler class dialog, pending cross-department requests; Submit for Approval blocked while loads are out of range unless an override reason is given (audited); approved requests queue a recheck.
- UI: balance summary strip with score, red/amber/green/blue statuses (Workload, Faculty cards), per-row checkboxes, approve/reject selected or all, change receiver, Preview impact table, History tab, approval status in exports.
- Faculty page and Assign dialog now take loads from the workload engine (one calculation everywhere).
- Tests: tests/workload.test.ts (balance rules, generation, validation) and tests/workload-approval.test.ts; 198 of 199 pass (permission-policy failure pre-existing).
- Verified the approve/stale/reject/recheck flow against the dev database with a script, then reverted it; one fresh 2-row proposal (Ana Santos 32/24) is pending.
- Not done: Schedule Requests other than cross-department carry no structured faculty or hours, so they get no projection; request review itself stays Administrator-only.

## 2026-11-01 Room booking urgent override (Phase A)

- Decisions: two phases (Phase B = recurring, equipment and facilities approval, waitlist, smart ranking, invitees and calendar invites, check-in and no-show); only Urgent and Critical displace classes; Faculty Regular, Head of Department up to Urgent, Administrator up to Critical (no Dean or Registrar roles).
- Schema: BookingPriority, UrgentReason, AcknowledgementStatus enums; BookingStatus gains Pending, Awaiting approval, Rejected, Completed, No-show; AdjustmentKind gains ONLINE; RoomBooking gains priority, reason, approval and displacement fields; new BookingAcknowledgement table. Migration 20261101170000.
- `lib/bookings/plan.ts` (pure): priority rules, caps, approval department, buffer, operating hours, holidays, displacement (classes to another room or time, else online; lower bookings to another room of the same type, else cancelled), shorten restore, lock keys, status labels.
- `lib/bookings/service.ts`: search, create (advisory locks per room and date plus a changed-since check inside one transaction), owning-department approval, cancel and shorten with restore, detail edits, acknowledgements, timeline (from Audit Logs), bell and email to faculty, section learners, section Heads, displaced booking owners.
- Engine: ONLINE sessions keep faculty and section busy without a room; `writePlan` and `undoProblems` split out of applyPlan and undoBatch for transactional use.
- UI: inline validation (old "Search is not available yet" line removed), Mark as urgent with reason, Urgent override option on results, impact confirmation, filters and priority badges, row actions, detail drawer with timeline, acknowledgement panel, availability day and week grid.
- Integration: Scheduler refuses weekly classes over upcoming confirmed bookings (dates already moved excluded); adjustments link to the originating booking and undo restores displaced bookings; calendar marks urgent bookings; Timetable Analytics shows the override report; Administrator settings hold buffer, hours, caps.
- Seed: sample urgent booking (Accreditation visit) with one moved class and a pending acknowledgement; added to the current database with the same idempotent function.
- Verified: tests/bookings.test.ts (15), full suite 213 of 214 (permission-policy failure pre-existing); scripted flow against the database (regular blocked, urgent displaces, race refused, cancel restores, other department awaits approval, faculty refused) then cleaned up.

## 2026-11-03 Profile redesign, Phase 1: profile photos

- Decisions: real UserSession table for Sessions and devices (Phase 4); native canvas cropper, no new UI library; sharp added to package.json (already installed through Next.js); phased delivery, commits only on approval. Phases: 2 layout, account and password; 3 two-factor stepper and recovery codes; 4 sessions.
- No migration: User.image already existed and now holds the 256px URL; the 64px copy sits beside it (`-64.webp`).
- `lib/avatar/storage.ts`: magic-byte check (JPEG, PNG, WebP), 5 MB cap, sharp re-encode to 256px and 64px WebP (EXIF dropped), random file names in `uploads/avatars` (git-ignored), old files deleted on replace.
- API: `POST` and `DELETE /api/profile/avatar` (own account only, any role, 10 changes per hour counted from Audit Logs, every change audited); `GET /api/avatars/[file]` serves files to signed-in users with immutable caching.
- UI: `UserAvatar` (colored initials fallback), `AvatarDialog` and `AvatarUploader` (drop zone, picker, webcam, remove, progress), `CropModal` (drag, arrow keys, zoom slider, live preview). Shown in the top bar, Faculty cards, User Management (with an Administrator Remove Photo action, audited), and the Profile page (interim placement until Phase 2).
- Verified: typecheck and lint clean; new routes redirect signed-out requests. Not yet tried in the browser; students have no profile page yet, so the avatar API is role-agnostic for later reuse.

## 2026-11-03 Profile redesign, Phases 2 to 4

- Page: `/profile` is now "Profile and Security": hero card (photo, role badge, department and position, last sign-in as "Today at 12:20 PM (2 hours ago)"), sticky section nav that follows scroll (horizontal tabs on small screens), one card per section, loading skeleton. `lib/format/when.ts` holds the date helpers.
- Account: name edits in place (audited, old and new value); email, role, department, employee ID, position and programs are read-only with a lock and tooltip. The name is saved on the user only, not on the linked faculty record. The top bar now reads the name from the database so a change shows at once.
- Password: show/hide fields, strength meter, live requirement checklist, match indicator, button disabled until valid, visible notice that all devices are signed out.
- Two-factor: 3-step stepper (scan, enter code, save recovery codes), QR beside a grouped monospace key with Copy, 6-box code input (auto-advance, paste, backspace, arrows), 10 one-time recovery codes (copy, download, "I have saved these" gate), regenerate and disable both ask for the password (disable also for a code). Recovery codes are stored as SHA-256 hashes and work in the sign-in code field; the login field now accepts up to 12 characters.
- Sessions: new `UserSession` table (migration 20261103043831_user_sessions_recovery_codes, also adds `User.twoFactorRecoveryCodes`). Sign-in creates a row and puts its id in the token; each request checks the row (revoked means signed out) and refreshes last-active at most every 5 minutes; sign-out marks it revoked. Rows older than a password change or "sign out everywhere" are hidden through a stored version. Per-device Revoke, This device badge, Sign out of all devices behind a confirmation dialog. Sign-ins made before this change have no row and are not listed, but still end on sign out everywhere.
- Assumptions: location is shown as the IP address or "Local network" because no geolocation service is used (avoids sending addresses to a third party); students still have no profile page.
- Verified: typecheck and lint clean; tests/profile-helpers.test.ts added; full suite 218 of 219 (the permission-policy failure was already failing). Not yet checked in a browser: the browser extension was not connected.

## 2026-11-03 Programs and Strands read-only for Head of Department

- Findings: server scoping already existed (`departmentWhere.program` on the list and detail pages, `scopeQuery`, `can`), so other departments never reach the page and a foreign program id gives 404. The gap was that the central policy let a Head of Department create, edit, delete and reorder programs of their own department.
- Policy: new resource type `programCatalog` (the program records themselves) and new action `rename`. A Head of Department can view own programs, cannot create, edit, archive or reorder them, and can rename only a department they own. `program` stays as the department-level stand-in used by `canManageDepartment` across rooms, adjustments and workload, so those are unchanged.
- Server: `saveProgramAction`, `deleteProgramAction` and the program branch of `reorderAction` check `can` and refuse with an audited "Blocked:" entry; new `renameDepartmentAction` reads only the name (trimmed, 2 to 100 characters, unique ignoring case), checks `can(..., "rename")`, writes an audit entry with old and new names and refreshes the layout so every page shows the new name. There are no REST routes for programs, so "403" is an error result plus the audit entry rather than an HTTP status.
- UI: `/programs` shows `ProgramsReadOnly` when `can(create)` is false: scope badge, subtitle "Programs under X.", department header with Rename, College and Senior High sections only when they have programs, whole-card links with hover and focus states, a neutral empty state with no Add button only when the whole scope is empty. Detail page hides Edit. Added `loading.tsx` and `error.tsx`.
- Not changed: Bulk Data Import stays in the sidebar for Heads of Department (it only reads programs and covers their subjects and rooms); the sections and subjects pages the detail page links to keep their department-level management.
- Verified: typecheck and lint clean; 3 new policy tests; scoping checked against the dev database for every Head of Department (Liza Cruz sees BSIT and BSCS only; Rhea Manalo only STEM and ICT; Daniel Ramos none; Joy Salazar both departments she acts for). Not clicked through in a browser.

## 2026-11-03 Subjects page: assignment flow and list redesign (Head of Department curriculum view)

- Decisions: subject change requests are reviewed as a new `SUBJECT_CHANGE` type in Schedule Requests (Administrator reviews, as for every request there; the owning department's Head of Department sees them); the redesign covers the Head of Department curriculum list only (the Administrator and other-levels list keeps its layout, with read-only rows now tinted and marked "Read-only", and a banner explaining the mode); specialization match is a keyword heuristic (faculty free text against subject code, title and description), labelled "Matches subject"; no new dependencies.
- Migration 20261103052902_subject_change_request_type: adds `SUBJECT_CHANGE` to `RequestType`. Request details live in `ScheduleRequest.details` (type, preferred faculty), so no new table. The old `SubjectChangeRequest` table is no longer written.
- Assignment: `AssignFacultyModal` replaces `AssignDialog`: section chips showing which sections have a teacher, "Currently assigned" panel with load bars and Replace and Remove, searchable faculty list (department, employment, specialization, Available only, Matches specialization, best matches first), load preview "19 -> 22 / 24 hrs" with green under 75%, amber to the limit, red at or over, reported-unavailability and class-time-conflict warnings, a review step with a required acknowledgement when someone would exceed their maximum, multiple faculty across multiple sections, last-updated line. `saveAssignmentPlanAction` applies a plan of per-section changes (assign, replace, remove) for one or more subjects in one transaction, rechecks department ownership on the server (blocked attempts are audited), writes one audit entry per change and notifies affected faculty. `assignmentConflictsAction` and `subjectDetailsAction` (history and class meetings) back the modal and the read-only panel.
- Requests: `RequestChangeModal` (type, required reason of 20 to 500 characters with counter, optional preferred faculty) replaces every `prompt()` and `alert()`; a duplicate pending request for the same subject is refused; each row shows a Request pending, approved or rejected badge linking to Schedule Requests.
- List: summary cards (clickable), one toolbar (search, term, category, status, sort) with a Filters popover, chips and Clear all; the term picker now decides the semester shown (Filters has "Every semester"); one category badge per row with "Managed by" and "Shared:" as a quiet second line; unassigned rows get an amber left border and badge; one primary action per row plus a menu (Assign or Reassign, Edit, View assigned faculty, View history, Archive in a confirmation dialog); sticky header and first columns; column toggle and table or card view saved per browser; pagination; bulk bar (Assign faculty, Archive with reason, Export CSV); cards also serve as the phone layout; skeleton, empty ("No unassigned subjects. Nice work!") and error states.
- Verified: typecheck and lint clean; new tests in tests/subject-plan.test.ts (plan, load projection, tone, match, status filters, CSV); full suite 231 of 232 (the permission-policy failure was already failing); SUBJECT_CHANGE rows write and read against the dev database (test row removed). Not clicked through in a browser.
- Manual test checklist: assign an unassigned subject (single section and All sections); reassign; remove; assign two sections to two different faculty; pick someone at their limit and confirm the red warning and the acknowledgement; pick someone with reported unavailability; assign a subject whose class time overlaps theirs; open the popover and View assigned faculty (history and schedule); as another department's subject, Request assignment and Request change (validation, counter, duplicate refused) then review it in Schedule Requests as Administrator and check the badge; archive one subject and several; export a selection; use each summary card, status, category, sort and chips; narrow the window to phone width; dark mode; keyboard only (Tab through the toolbar, Esc closes dialogs, arrow keys in menus).

## 2026-11-03 Audit Logs limited to the Administrator

- Removed Audit Logs from the Head of Department sidebar; dropped the specific route rule so `/admin/audit-logs` falls under the Administrator-only `/admin` rule (the proxy answers 403); the page now requires the Administrator; the dashboard's "View audit log" link shows for the Administrator only. The recent-activity list on the dashboard is unchanged.

## 2026-11-03 Schedule Requests page redesign

- Decisions: the owning Head of Department can approve or reject, in addition to the Administrator; Cancelled is a new status; requests keep the existing notification flow; no new dependencies.
- Migration 20261103081417_request_status_cancelled adds `CANCELLED` to `RequestStatus`.
- Permissions: `canReviewRequest` (lib/requests/rules.ts) is the single rule used by the page and by `reviewRequestAction`. The Administrator decides anything pending; a Head of Department decides requests aimed at their department and ordinary class requests from their own department, never their own request and never a faculty-record change; blocked attempts are audited. Only the person who filed a pending request can edit it (plain class requests) or cancel it (any type).
- Actions: `createRequestAction` now takes structured input and stores a "current vs requested" snapshot (room, day and time, faculty) in `ScheduleRequest.details`; new `updateRequestAction` and `cancelRequestAction` (reviewers are notified); `reviewRequestAction` uses the shared permission rule. Approving a change request still only records the decision, it does not edit the timetable.
- Page: summary cards that filter (Total, Pending, Approved, Rejected), search plus status and type filters, sortable columns, pagination, sticky header, status and type badges with icons, relative time with date, details truncated with a tooltip, row menu (View details, Edit, Cancel, Approve, Reject), details drawer with status timeline and reviewer comments, skeleton, empty states with illustration and a create button, error state with retry, cards on phones, optimistic row after submitting.
- Form: wider modal, required markers, inline validation (type required, details 10 to 500 characters with counter), searchable class picker (code, section, day, time, room) required for change and cancel types and disabled for a new schedule, type-specific helper text and placeholder, requested room, time or faculty with a current-to-requested preview, cancel confirmation dialog, reject needs a reason (replaces the browser prompt).
- Verified: typecheck and lint clean; tests/request-rules.test.ts (8); full suite 239 of 240 (the permission-policy failure was already failing); CANCELLED writes to the dev database. Not clicked through in a browser.
- Manual test checklist: submit each of the five types (class required or disabled as expected, requested fields, preview, counter, Esc closes, focus starts on Request type); the new row appears at once; open the drawer from the row and the menu; edit a pending request; cancel with the confirmation; as an owning Head of Department approve one and reject one (reason required); confirm the requester sees a notification; confirm a Head of Department cannot approve their own, a faculty-record change, or another department's request; filter with each card, search, type; sort every sortable column; page size and paging; phone width; dark mode; keyboard only.

- Update: only Heads of Department approve. `canReviewRequest` no longer lets the Administrator decide requests a Head of Department owns; the Administrator still sees every request and decides only those no head can: faculty-record changes, requests with no owning department, and requests filed by a Head of Department (who cannot approve their own). The Schedule Requests subtitle and the Subjects request dialog wording match.

- Update: only the owning Head of Department can edit or cancel a pending request (plus a head's own requests). Faculty can submit and follow status but can no longer edit or cancel what they filed, and the Administrator has neither action. `canEditRequest` and `canCancelRequest` now take the person and the request (same ownership test as approving); the server refuses and audits other attempts, and tells the requester when a head edits or cancels their request. Page subtitle updated per role.

## 2026-11-05 Student portal redesign (phases 1-2)

- Student portal now uses the shared sidebar and top bar via app/student/(portal)/layout.tsx; STUDENT_NAV added to nav-config.
- New pages under /student: schedule, subjects, rooms, calendar, notifications, profile (read-only).
- lib/student/portal.ts loads only the signed-in student's section; activities now limited to APPROVED (was leaking pending ones).
- Dashboard: greeting, summary cards, live Today panel, next class, dismissible notices.
- Timetable: weekly grid with today column and now line, day agenda (default below lg), grouped list with merged runs, filters, details drawer.
- Pending: room cards, activities list with upcoming/past, single Export menu with .ics, print layout polish.

## 2026-11-06 Removed Enrollment Forecast

- Deleted `/forecast` page, `lib/forecast`, its test, nav link, breadcrumb, and route permission.
- Dropped `EnrollmentRecord` (migration `20261106234500_remove_enrollment_forecast`) and its seed data.
- Dashboards: removed enrollment trend chart and Head of Department needs panel; "Students enrolled" card now sums section learner counts.
- Section auto-generate no longer pre-fills total learners from the forecast (defaults to 106).

## 2026-11-07 Super Administrator and Registrar roles; new system title

- Role enum: `ADMINISTRATOR` renamed `REGISTRAR`, added `SUPER_ADMINISTRATOR` (migration `20261107000000_super_administrator_and_registrar`).
- Super Administrator only: user management, program assignments, system settings, audit logs, account approval notifications, archiving users.
- Registrar: everything else school-wide (`ADMIN_ROLES`, `isAdmin`); policy `can` denies Registrar on user, settings, auditLog.
- Demo accounts: superadministrator@granby.edu.ph, registrar@granby.edu.ph (local database updated in place).
- Title "AI-Driven Faculty and Room Scheduling System"; institution name now uses "and" (CLAUDE.md updated).

## 2026-11-07 Scheduler layout

- Section cards removed; overview is schedule sheets with a tab per program plus one per level without programs (Senior High, Junior High, Elementary). Each sheet header shows status badges, Resolve, and Open timetable editor.
- Back button removed; header breadcrumb (Dashboard > Class Schedules > section) returns to sheets and confirms before leaving with unsaved changes.
- Side panel: Conflicts, Unscheduled, Warnings, Constraints are collapsible sections (open by default when they have items); "Hide checks" hides the whole panel. Both remembered per browser via usePersisted.

## 2026-11-07 Examination schedule and calendar follow the scheduler layout

- Shared pieces: PageTabs (components/ux/page-tabs.tsx), ChecksHeading, ChecksRail, PanelSection (schedule-chrome.tsx); PanelTab removed.
- Examination schedule: Back removed (breadcrumb shows the focused section, proctor, or room); year and term on the left; Conflicts, Unscheduled, Constraints collapsible; hide rail shares the class schedule preference.
- Calendar of Activities and Semester Proposals: CalendarTabs replaces the underline tab bars with the prominent PageTabs style.

## 2026-11-07 Less overwhelming navigation and dashboards

- Sidebar folds related pages into one entry per group (nav-config.ts `tabGroup`, `TAB_GROUPS`): Scheduling Changes, My Teaching, Academic Setup, Reports and Analytics, System Administration. A group with one visible page keeps that page's own name.
- One tab bar (SectionTabs in the dashboard layout) switches between the pages of a group; routes and permissions are unchanged, and shortcuts still work (allowedHrefsForRole includes tab pages).
- Sidebar items per role dropped from about 20 to 8-11.
- Analytics shown once: Registrar dashboard no longer repeats the workload table and latest fixes; Head of Department dashboard keeps counts, approvals and pending fixes only; School overview drops the utilization charts and heatmap that live on the Timetable utilization tab. Removed WorkloadSection, LatestFixesSection, workload-chart, latest-fixes.
- tests/misc.test.ts: access-versus-menu test now uses allowedHrefsForRole; added tab tests.

## 2026-11-07 Head of Department dashboard shows only handled programs

- New lib/permissions/handled.ts (handledScope, handlesTerm): levels and programs a Head of Department handles, from scoped programs and sections.
- Dashboard header term badges and the term dropdown are limited to those terms (Computing head: 16 terms down to 4, one active); a term in the address that is not handled falls back to a handled one.

## 2026-11-07 Head of Department dashboard redesign

- Order: toolbar, Needs your attention (workload fixes with a one-line empty state, then pending approvals), figure cards, upcoming, link to Timetable Analytics.
- Pending approvals: first 4 per group with real totals (departmentExtras.totals) and a View all link.
- Figure cards: icon, larger value, progress bar for utilization rates; one note says what changes compare with. countChange hides growth when the previous term is under a quarter of the current size; ChangeBadge no longer repeats "No data" on each card.
- Toolbar: switch and term picker on one row, one Export menu (ExportMenu) for spreadsheet and PDF.
- Term names drop the level when one level is handled and list the active term first; Faculty term badges and dropdown follow the levels they teach (handledScope).
- Compact header banner.

## 2026-11-07 Specific room booking

- Room Booking form: a Room field (Any available room, or one chosen room) replaces the room type position; room type shows only for Any available room. The button reads "Check this room" for a chosen room.
- searchRooms and findRoomsAction accept an optional roomId; the result is that one room (free, moves classes, or unavailable) with a "Find other rooms for this time" button.
- Room choices are the person's department and shared rooms, plus every room when they can book urgently (page.tsx roomChoices).
- Clicking a free time in the one-day Room availability grid fills the form with that room, day, and time; Duplicate on a booking keeps its room.

## 2026-11-07 Room Booking redesign

- Form: one Priority control (Regular, High, Urgent, Critical) replaces the dropdown plus urgent switch; Duration replaces End (shows the end time, checks closing time); quick date chips (Today, Tomorrow, Next week); Attendees starts blank; two-column layout.
- Page: tabs Find a room and Room availability (the grid is no longer collapsed at the bottom); form on the left with results on the right from the xl width; results show Best match, seats spare or short, and Group by building.
- Weekly repeat (Regular priority only): weeklyDates and MAX_REPEATS in lib/bookings/plan.ts; bookRoomAction books each later date separately, skips taken or closed dates, and the client lists them. Test added.
- My bookings: filters behind a Filters button with a count; empty Upcoming tab offers Book a room.

## 2026-11-07 Urgent override: choices, protected classes, student notices

- Planner (lib/bookings/plan.ts, lib/occupancy/engine.ts): each displaced class gets up to three placements (relocateOptions) plus online as the last choice; the person picks in the booking dialog and the server replans with `choices` (placement keys), falling back to the best when a choice is stale.
- Make-up window: planning loads PLAN_WINDOW_DAYS (21) so a class can move to a later day instead of going online. Times over lunch or ending after 6 PM are tried last; rooms in the same building are tried first (already so).
- Schedule.doNotMove (migration 20261107120000): set in the class dialog, shown with a lock on the timetable; an urgent booking is blocked from a protected class unless the Registrar confirms (canMoveFixed).
- Students: PortalMove list and Moved tag on the dashboard and timetable, with a general reason (the urgent purpose is not shown).
- Approvals: the override notification opens the booking; the bookings page lists overrides awaiting approval with one-click Approve.
- Registrar dashboard: Moved by urgent bookings (last 7 days, reasons, latest bookings).

## 2026-11-13 - Sidebar, topbar, assistant, calendar, and light-mode cleanup

- Sidebar: groups start closed (only the group with the current page opens); open groups are saved under `sidebar-open-groups`. Removed Notifications and Scheduling Assistant links, the tagline, and the keyboard shortcuts footer row.
- Topbar: bell opens a notifications popup (`components/layout/notifications-menu.tsx`) with mark read, mark all, and View all; added a Schedule link to `/scheduler` for non-student roles.
- Scheduling Assistant: floating button and popup (`components/assistant/assistant-widget.tsx`) for Head of Department, Registrar, Super Administrator; removed the `/assistant` page.
- Calendar of Activities: classes and examinations removed (page, class scope filter, legend); bookings, events, holidays, suspensions remain.
- Light mode: darker page background, stronger borders, card and sidebar shadows, root font size 106.25 percent (`app/globals.css`).
- Not verified: typecheck, lint, tests, and browser check could not run because the disk holding the temp folder was full.

## 2026-11-13 - Academic level tabs and strict level separation (phase 1)

- New `components/academics/level-tabs.tsx`: one tab per academic level with record counts; keeps term and status filters, resets the drill-down. College is the default so a list never mixes levels.
- Subjects and Sections pages show the tabs above the existing Course, Year, Grade flow (the level card step is skipped).
- Basic-education Subjects list (`subjects-list.tsx`) gains the Cards or Table toggle through `CollectionView`.
- `lib/scheduler/class-save.ts`: a class is rejected unless its section, subject, and term share one academic level (section and subject saves and imports already validated level).
- Pending: level tabs on Faculty, Rooms, Programs, Scheduler, Calendar, Reports, Analytics; toggle on remaining card grids; Sections toolbar. Typecheck passes; tests and browser check not run.

## 2026-11-13 - Academic level separation (phase 2)

- Faculty: "All levels" filter replaced by level tabs with counts; College is selected first.
- Programs and Schedule Reports: level tabs (`LevelTabs`); reports now load schedules, sections, terms, and faculty for one level. Approved activities with no level (school-wide) show under every level.
- Scheduler: the level filter always has one level selected (first scoped level), no "All levels" option; Clear filters returns to it.
- `subjects/assignment-actions.ts`: assignment is rejected unless subjects, sections, and the term share one level.
- Not changed: Rooms (no academic level in the schema), Analytics (already scoped by a level-specific term), Calendar activity form (school-wide events keep an optional level), stat-tile grids (no table form).
- Typecheck passes; tests and browser check not run.

## 2026-11-13 - Sections toolbar

- `sections-grid.tsx`: search (section or program), filter (unscheduled classes, exceeds room capacity), sort, and spreadsheet export; both Cards and Table views use the filtered list. Reordering is blocked while a search, filter, or sort is active.
- Typecheck passes; tests and browser check not run.

## 2026-11-13 - Test runner fix

- Default Vitest pools crash here with "Cannot read properties of undefined (reading 'config')" (worker runner undefined); root cause not found. `vitest.config.mts` now uses `pool: "vmForks"`, which runs.
- Added aliases to inert stubs (`tests/stubs/server-only.ts`, `tests/stubs/next-cache.ts`) because vm pools ignore `vi.mock` for those modules; `__dirname` replaced by `import.meta.dirname`; alias for "@" made a `^@/` regex.
- Result: 51 files, 457 tests pass.

## 2026-11-13 - Phase 4: server-side level rules

- `class-save.ts`: faculty newly assigned to a class (or a changed section) must teach the section's level; existing classes stay editable.
- `scheduler/exam-actions.ts`: an examination's section, subject, and term must share one academic level.
- Workload rows carry `byLevel`; the board shows the split under the combined load (totals are not split).
- Tests: timetable-class-validation mocks now carry levels and cover level mismatch and faculty level; workload test covers `byLevel`. Suite: 51 files, 460 tests pass.

## 2026-11-13 - Class suspension redesign, step 1: permission

- Decisions: only the Registrar and Head of Department may suspend; Super Administrator is excluded (view and export only). A Head of Department suspension is immediate for own department and audited; no Registrar approval.
- `policy.ts`: new `classSuspension` resource (department managed and program scoped for Head of Department, unrestricted for Registrar, view and export only for Super Administrator, denied to Faculty and Student).
- `PERMISSION_MATRIX.md` and `permission-policy.test.ts` updated; policy suite 14 tests pass, typecheck clean.
- Next: ClassSuspension schema (needs user OK), server actions wrapping planSuspension/applyPlan, new Class Suspensions page, calendar projection.

## 2026-11-13 - Class suspension redesign, step 2: schema

- Added `ClassSuspension` (title, reason, dates, times, sections, level, department, status ACTIVE or LIFTED, issuer and role, lifter, batch) and `SuspensionStatus`, with relations on User, Department, AdjustmentBatch.
- Migration `20261113044110_class_suspension` (Prisma-generated; a duplicate hand-diffed copy was removed) was applied to the remote Supabase database with `prisma migrate deploy` on 2026-11-13.
- Prisma client regenerated; typecheck clean.

## 2026-11-13 - Class suspension redesign, step 3: server actions

- New `app/(dashboard)/suspensions/actions.ts`: preview, apply, and lift. Apply wraps `planSuspension` and `applyPlan`, stores a `ClassSuspension` row (issuer and role), creates the calendar activity as a projection, and audits Head of Department orders as immediate.
- Rules enforced on the server: `classSuspension` policy per section (department and program), one academic level per order, whole-level or all-levels orders Registrar only, lift by owning department or Registrar.
- Old Suspension tab in Schedule Adjustments is untouched until step 4 replaces it.
- Tests: `class-suspension-actions.test.ts` (6) pass; typecheck clean.

## 2026-11-13 - Class suspension redesign, step 4: page and navigation

- New `/suspensions` page (Registrar and Head of Department only): level tabs, order form, preview of cancelled classes, confirm ("Suspend classes now"), make-up pickers after applying, and an order list with issuer, role, status, and Lift.
- Registrar may suspend a whole level or every level; Head of Department must name sections of own department.
- Removed the Suspension tab from Schedule Adjustments; undoing a suspension batch there is refused and points to Class Suspensions. Calendar links and messages now point to `/suspensions`.
- Sidebar entry added for both roles; route guard and breadcrumbs added; navigation test covers Super Administrator, Faculty, Student denial.
- Suite: 52 files, 468 tests pass (one unrelated department-logo test failed once under load, passed on rerun).

## 2026-11-13 - Class suspension redesign, step 5: seed and notice wording

- Sample data: the seeded typhoon suspension is now a Registrar order (`ClassSuspension` plus adjustment batch and calendar entry) so it appears on Class Suspensions and can be lifted.
- Calendar and student notices end with "(ordered by the Registrar)" or "(ordered by the Head of Department)"; only the role is shown, never the person.
- Not done: browser check, which needs the `class_suspension` migration applied first.

## 2026-11-13 - Class suspension: choose programs, not sections

- The Class Suspensions picker now lists programs (courses or strands) of the selected level as tiles with their section counts; the server resolves chosen programs to their active sections.
- Request field `sectionIds` became `programIds`; Head of Department programs are checked per section through the `classSuspension` policy; empty selection (whole level) stays Registrar only. Stored orders still keep the resolved section list.
- Tests updated; typecheck and lint clean.

## 2026-11-13 - Removed Scheduling Periods and Emergency Schedule Access

- Deleted `/admin/scheduling-periods` and `/admin/emergency-access` (pages, actions, form), `lib/scheduler/periods.ts`, `period-rules.ts`, and `tests/scheduling-periods.test.ts`; removed sidebar items and route guards for the Registrar.
- Submission windows no longer exist: class and examination submissions are not gated by a period, the lock inside `createSubmission` is gone, and the dashboards drop the period cards and the open or closed banner.
- Schema: `SchedulingPeriod` model and its two enums removed. Migration `20261113080000_remove_scheduling_periods` (drops the table and types) was applied to the remote database on 2026-11-13 after confirming the table was empty.
- Tests: emergency correction action tests removed; navigation tests assert the removed pages are no longer reachable. Suite: 51 files, 452 tests pass; typecheck and lint clean.
- Registrar no longer has a post-publication correction page; published class changes now go through the normal scheduler and adjustments.

## 2026-11-13 - Unpublished timetables hidden from faculty and students

- Rule: only PUBLISHED classes and examinations reach Faculty and Student; the Registrar alone approves and publishes (already enforced in the review actions; schema comment corrected).
- Added `lib/scheduler/visibility.ts` (`publishedFilter`) and a `publishedOnly` option on `loadPlan`.
- Applied to the faculty timetable and analytics, dashboard plan, My Subjects, Scheduler page for Faculty, and the assistant. Student portal was already filtered.
- Workload and conflict checks still count drafts so planning stays accurate. Test: `tests/schedule-visibility.test.ts`; suite 52 files, 454 tests pass.
- Faculty with no published classes see "Your timetable is not published yet" on the Scheduler page.
- Notices about moved, cancelled, restored, undone, make-up, and repaired classes now go to faculty and learners only for published classes (`lib/scheduler/published.ts`); managers still hear about every moved class.

## 2026-11-15 - Process animation for Auto-Schedule and Resolve issues

- Added `components/scheduler/process-animation.tsx`: class blocks pop into a small timetable with a sweeping highlight, above stage chips, an optional progress bar, and one status line.
- Resolve issues (`resolve-issues.tsx`): replaces the spinner; stages Find issues, Fix, Improve follow the solver's real progress. A 1.2 second minimum hold keeps it visible; Cancel also ends the hold.
- Auto-Schedule (`auto-schedule-dialog.tsx`): shown while the preview is generated; stages Read curriculum, Place meetings, Check conflicts advance on a timer (the server action reports no progress), with a 2.4 second minimum.
- Keyframes `process-pop` and `process-scan` in `app/globals.css`; motion is off under reduced motion (static blocks). Typecheck and lint clean; not yet checked in a browser.

## 2026-11-15 - Booking overrides on the faculty dashboard

- Already in place: an override that moves a published class sends a bell notice and email to its faculty member and the section's students (`notifyDisplacement` in `lib/bookings/service.ts`), and the student dashboard lists it under "Changes to your timetable".
- New: `lib/scheduler/class-moves.ts` (`upcomingClassMoves`) holds the class-change query that was inline in `lib/student/portal.ts`; the student portal and `facultyLanding` both use it.
- Faculty dashboard (and Head of Department "My Teaching"): "Changes to your classes" panel plus a "Class changes" tile (replaces the duplicate "Classes remaining" tile). `MovedList` takes `showSection` to show the section instead of the subject name.
- Only PUBLISHED classes notify or appear, per the 2026-11-13 rule. The development database has 8 draft and 0 published classes, so an override there notifies only managers.
- Typecheck, lint, and booking, notification, and dashboard tests pass; not checked in a browser.

## 2026-11-15 - Redesign of the Resolve issues and Auto-Schedule dialogs

- New `components/scheduler/process-dialog-parts.tsx`: `DialogHero` (icon, title, one-line description), `Segmented` (radio group as a segmented control with counts), `ToggleCard` (checkbox as an icon card), `Fact` (icon pill).
- Resolve issues: segmented scope with section chips for "Selected", issue types and limits as toggle cards, shorter labels, one fact pill instead of the helper paragraph.
- Auto-Schedule: segmented scope, three fact pills, primary "Generate preview"; the preview shows three stat tiles, meetings grouped by section in collapsible cards (section named once) with time, room, and teacher pills, and a collapsed "Needs attention" list.
- `tests/auto-schedule-render.test.ts` text updated. Its two dialog tests still fail on `useRouter`: `vi.mock("next/navigation")` does not take effect under the vmForks pool, which also fails four other test files (existing problem, not from this change).
- Typecheck and lint clean; not checked in a browser.

## 2026-11-15 - Redesign of the Unscheduled lists in the scheduler

- Side panel (`SectionNeedsSummary` in `side-panels.tsx`): one total strip, then sections grouped by program in collapsible groups, as two-column tiles showing the section and its count with a small bar; "unscheduled" is no longer repeated per row.
- "Where to look" card (`scheduler-workspace.tsx`): icon, title, and total badge; one row per program with compact section chips. Short section names replace the mixed long names, the full name is in the tooltip, and the cap rose from 8 to 24 sections.
- `sectionGroups` (exported from `side-panels.tsx`) groups by the name before the last space of the short section name.
- Typecheck and lint clean; not checked in a browser.

## 2026-11-15 - User Management fixes

- `admin/users/manager.tsx`: two separators that rendered as "?" (Account review banner, faculty line under an account) are now "·".
- Account review banner shows only non-zero counts, as chips.
- Role and department column no longer prints "No department assigned"; an unlinked Faculty or Head of Department account shows "No faculty link" instead.
- `faculty-account-alignment.tsx`: the Registrar faculty roster is collapsed by default so the Account directory is not pushed below a 31-row table; helper text shortened.
- Open question for the user: `ROLE_LABELS.SUPER_ADMINISTRATOR` is "Administrator" while CLAUDE.md names the role "Super Administrator".
- Typecheck and lint clean; not checked in a browser.

## 2026-11-15 - Removed the "Where to look" card from the scheduler

- Deleted `WhereToLook` and its per-section conflict and unscheduled counts from `scheduler-workspace.tsx` at the user's request; the side panel still lists unscheduled sections and conflicts.
- `sectionGroups` in `side-panels.tsx` is now private to the side panel.

## 2026-11-15 - Full screen button on the scheduler timetable

- `scheduler-workspace.tsx`: "Full screen" button beside the timetable title (or above the schedule sheets when no section is open). The timetable section becomes a fixed overlay and the page enters browser full screen, so class dialogs and drag and drop still work; Escape or "Exit full screen" restores the layout.
- Typecheck and lint clean; not checked in a browser.

## 2026-11-15 - Part-time faculty choose their available days

- `/availability` shows a "My available days" card to part-time faculty (and part-time Heads of Department): seven day chips and Save (`availability/available-days.tsx`).
- `saveAvailableDaysAction` (`availability/actions.ts`): part-time only, at least one day. Rewrites `FacultyAvailability`: removed days are deleted, kept days keep their hours, new days are open all day. Clears the single `dayOff`, writes an audit log, notifies the Head of Department and Registrar (warning with the count when existing classes sit on a removed day), queues a workload check.
- No new enforcement was needed: the conflict detector, slot check, resolver, suggestions, and workload optimizer already honour `FacultyAvailability`.
- `lib/faculty/available-days.ts` (`availableDays`, `WEEK_DAYS`); Faculty details show "Available days" for part-time faculty in place of "Day off".
- Decisions made without asking: saves apply immediately (no approval), and removing a day with classes is allowed with a warning rather than blocked.
- Typecheck and lint clean; not checked in a browser; no tests added.

## 2026-11-15 - Aligned User Management with Faculty (data only)

- Finding: the app already keeps the two aligned (archiving a faculty record archives its account in `lib/archive/archive.ts`; names sync on faculty update; teaching accounts must be created from or linked to a faculty record). The mismatches came from the one-off `prisma/coics-faculty.ts` roster replacement, which archived faculty records but deliberately kept their accounts.
- Data change on the development database, chosen by the user: archived the 4 active accounts whose faculty records are archived (Ana Santos `faculty@`, Carla Dizon, Mika Alonzo, Liza Cruz `head.computing@`), sessions ended, one audit log entry each. They can be restored from Archived Users, which also restores the faculty record.
- Consequence: the College of Informatics and Computing Sciences has no Head of Department account, and the demo logins `faculty@granby.edu.ph` and `head.computing@granby.edu.ph` no longer sign in.
- Left as is, chosen by the user: 3 Faculty accounts with no faculty record stay flagged "No faculty link" for manual linking.
- No code changed. `prisma/coics-faculty.ts` still keeps accounts if run again.

## 2026-11-16 - Faculty roster as the user list

- User Management now leads with "Faculty accounts": one row per roster faculty member with login email and one status chip.
- Create account per row: Gmail plus role; system generates a 12-character password shown once with Copy login.
- Row menu: Reset password (generated), Change email, Suspend or Reactivate, Edit role and details.
- Demo and non-faculty accounts kept, moved to a collapsed "Other accounts" section.
- New `User.mustChangePassword` (migration 20261116030000_must_change_password, applied); dashboard layout redirects to /change-password until set.
- Flag cleared by /change-password, profile password change, and emailed password reset.
- Audit log entries for account creation, password reset, email change, suspension.

## 2026-11-16 - Bulk faculty account creation

- "Bulk create" on Faculty accounts: upload CSV or paste rows (Employee ID, Gmail, optional Role); template download.
- Preview checks each row against the roster (not on roster, already has account, invalid email, bad role, duplicates); only ready rows are sent.
- Server creates each row independently via shared `provisionFacultyAccount`; up to 300 rows; generated passwords, forced change on first login.
- Results show created and failed counts; "Download logins" exports name, employee ID, email, temporary password.
- Bulk create now starts with a department picker; rows for faculty in other departments are flagged in preview and rejected on the server; logins file includes the department.

## 2026-11-16 - Registration fields

- Staff registration page 1: Full name, Suffix, Sex / Gender (Male, Female), Email address, Employee ID, Employment type, Department; page 2: password and confirm password (unchanged).
- New `Faculty.suffix` and `Faculty.sex` (enum Sex), migration 20261116050000_faculty_suffix_sex applied; suffix is appended to the full name.
- Backfilled Faculty.sex for 16 faculty from Mr./Ms. titles (scripts/backfill-faculty-suffix-sex.mts); 27 without a title left blank.

## 2026-11-16 - Room priority constraint and constraints redesign

- New constraint kind ROOM_PRIORITY (Room rule, Preferred): room plus priority faculty member; migration 20261116060000_room_priority_constraint applied.
- Head of Department may only pick own-department rooms and faculty (checked on save); room records stay read-only for them.
- Auto-schedule, Resolve issues, and scheduler room suggestions try the priority room first (`withPriorityRooms`); others may use it when free; never a violation.
- Rooms page: "Priority: <faculty>" chip; Heads of Department see it instead of their own department designation.
- Add constraint dialog redesigned: icon category tiles, type chips with strength dot, settings panel, days-off chips, name and scope last.
- Scheduling Constraints page trimmed: shorter header, no legend or helper paragraphs, compact timetable defaults row, segmented filters.

## 2026-11-16 - Department Management redesign

- One compact row per department (logo, name, head or "No head" chip, counts); search and All / No head filter; Add department dialog.
- Side drawer per department: Details (edit code and name, delete only when nothing is linked), Programs (College or Senior High School tab, add / edit / delete; delete blocked while sections or subjects use it), Head (assign or remove).
- New `deleteDepartmentAction` blocks on linked programs, faculty, rooms, sections, subjects; audited.
- Data: moved 7 Senior High School strands (STEM, ABM, HUMSS, GAS, IA, ICT, TVL) with 7 sections and 5 subjects from Basic Education Department to Senior High School Department; deleted College of Arts and Sciences with 3 faculty records, 2 rooms, 2 activities (audited).

## 2026-11-16 - Mobile friendly, round 1

- Audit at 390 px (Registrar, 23 pages): page-level sideways scroll on Faculty, Programs, Schedule Adjustments; wide tables on Analytics, Workload, Reports, Review Center; calendar grid 1100 px; many sub-32 px tap targets.
- Fixed sideways scroll: grid cards get min-w-0 (Faculty, Programs), Adjustments grid children min-w-0, Faculty card actions wrap and filters stretch.
- Shared Table now stacks into labelled cards below 640 px (headers copied to data-label); opt out with stack={false}.
- Calendar shows an agenda list on phones instead of the month or week grid.
- Touch screens: xs/sm/icon buttons get a 40 px minimum tap target (button data-size attribute).
- Full suite: 118 files, 933 tests pass.

## 2026-11-16 - Mobile friendly, round 2

- Audited at 390 px as Super Administrator (8 pages), Head of Department (11), Faculty (10), Student (5): no page-level sideways scroll remains.
- Switchable lists (Subjects, Requests, Faculty, Rooms, Departments) always show cards on phones; the view switch is hidden there.
- Department staffing table stacks into labelled cards; stacked cells wrap long text.
- Mobile breadcrumb items shrink and truncate (long department names overflowed the Faculty calendar).
- Schedule sheets open on Agenda on phones; weekly grid one tap away.
- Full suite: 118 files, 933 tests pass.
- Registration approval is on by default (missing setting counts as on) and switched on; Faculty accounts list shows a Pending filter and an Approve button for pending accounts.
- Approval requires a verified email (server check); Faculty accounts shows 'Awaiting email verification' until then, then an Approve button.
