# Permission Matrix

This document mirrors `lib/permissions/policy.ts`. Unlisted combinations are denied. “Own” includes a permanent department assignment and an acting assignment while its date range is active.

| Role | Resource | View | Create / edit / reorder | Archive / restore | Submit / request change | Approve / reject | Export |
|---|---|---:|---:|---:|---:|---:|---:|
| Administrator | Accounts, roles, settings, terms, buildings, and rooms | Yes | Yes | Yes | Yes | Yes | Yes |
| Administrator | Schedules, examinations, and adjustments | Yes | No | No | No | No | Yes |
| Administrator | Room bookings and scheduling constraints | No | No | No | No | No | No |
| Administrator and Registrar | Schedule requests, change requests, workload fixes | No | No | No | No | No | No |
| Registrar | Room bookings across all departments and shared rooms | All bookings | Create in any room; edit own bookings | Cancel own bookings | Submit own bookings | No | Yes |
| Registrar | Published activity proposals | Yes | No | No | No | No | Yes |
| Registrar | Department management | Yes | Create and edit | No | No | No | No |
| Registrar | Class suspensions, any department or level | Yes | Yes | Lift | No | No | Yes |
| Head of Department | Class suspensions of own department, effective immediately and audited | Yes | Yes | Lift | No | No | Own scope |
| Administrator, Faculty, Student | Class suspensions (Administrator may view and export; Student sees the resulting notice only) | Administrator only | No | No | No | No | Administrator only |
| Registrar and Head of Department | Scheduling constraints | Yes | Within authority | Within authority | No | No | No |
| Head of Department | Department room bookings, schedule requests, workload fixes, change requests | Yes | Within department | Within department | Yes | Yes, except own requests | Within scope |
| Head of Department | Own programs, subjects, sections, schedules, examinations, activity proposals | Yes | Yes | Yes | Yes | No | Own scope |
| Head of Department | Own faculty records | Basic details and workload | No | No | Request change | No | No |
| Head of Department | Shared College General Education subject assignments for own sections | Yes | Propose only | No | Submit proposal | No direct approval | Own scope |
| Head of Department | Assignment proposals routed to own faculty department | Yes | No | No | No | Yes, except own proposals | Own department |
| Head of Department | Shared rooms and cross-department faculty availability | Basic read-only details | No | No | Request change | No | No |
| Administrator and Registrar | Subject assignment proposals across all faculty departments | Yes | No | No | No | Yes | School-wide |
| Head of Department | Other-department private records | No | No | No | No | No | No |
| Faculty | Own schedule, load, bookings, and requests | Yes | Submit requests only | No | Yes | No | Own records only |
| Faculty | Other faculty private records | No | No | No | No | No | No |
| Student | Own section schedule and examination schedule | Yes | No | No | No | No | No |
| Student | Approved calendar for own section scope | Yes | No | No | No | No | No |
| Archived, suspended, inactive, or unauthenticated user | Every resource | No | No | No | No | No | No |

## Registrar scheduling controls

- Heads of Department may suspend published class meetings or move them to virtual delivery within their assigned departments and programs. Targets may be programs, sections (including those without programs), or individual published classes. Whole-level and all-level orders remain Registrar-only. Preview and confirmation are required; the impact is recalculated before saving. Virtual meetings retain their dates, times, and faculty, release their physical rooms, and require no make-up class. Joining links must use HTTPS. Orders, calendar projections, and dated changes are saved together and audited; affected faculty and students are notified. Lifting an order restores the original arrangements only when the slots remain available.

- Submissions are not limited to scheduling periods; a Head of Department can submit a complete timetable at any time. There is no Faculty load submission workflow.
- Departments prepare, endorse, and submit timetable packages. The Registrar may approve only submitted packages, and publication requires prior approval.
- Administrators and the Registrar can view current class and examination meetings only after the Head of Department submits their timetable for approval, or after publication. Unsubmitted drafts, orphan review rows, and returned, rejected, or withdrawn revisions remain private until resubmission. Submitted snapshots remain available in review history. Internal collision checks still reserve draft slots; room availability shows their occupancy anonymously.
- After publication, the Registrar manages changes or removal of official class and examination schedules. Each change requires a documented reason, an audit record, and automatic notification to affected users.
- Heads of Department may edit their department's drafts. Submitted schedules remain locked while awaiting a decision; published changes must be requested from the Registrar.
- A shared College subject assignment proposed by a Head of Department stays inactive until approved by a Head of Department in the proposed faculty member's home department. The Registrar and Administrator can review and decide any proposal; the General Education catalog is not an approval department. The proposed faculty member is notified after approval.
- The Registrar may create and update department codes and names, view linked program, faculty, section, and room counts, and assign existing active Head of Department accounts. Department-access assignments are audited; accounts and user roles remain managed by the Super Administrator.

Sensitive Administrator changes require an audit reason at the mutation boundary. Every blocked mutation is logged. Five blocked attempts in fifteen minutes notify active Administrators.

## Administrator scope

Each department may have only one active Head of Department at a time. Authority includes both the account’s linked faculty department and explicit permanent or acting assignments. Overlapping future assignments also reserve the position. Assignment, account creation, promotion, reactivation, faculty relinking, faculty department changes, and archive restoration are checked in transactions sharing the same advisory lock. Conflicting changes roll back and return a readable error. Existing duplicate authorities are displayed for correction; they are never removed automatically.

The Registrar may assign existing active Head of Department accounts to vacant departments. Department Management lists active faculty with active Faculty accounts in that department as candidates for human review. Only the Super Administrator may enable the Head of Department account role. Faculty suggestions are alphabetical, and leadership experience and teaching workload must be reviewed before appointment.

The Super Administrator owns system operation, security, configuration, user accounts, and access recovery. Academic scheduling decisions remain with departments and the Registrar. Routine class writes explicitly refuse Super Administrator actors.

The Registrar may search and request bookings for every active room, including other departments' rooms and shared rooms, and manage their own bookings while monitoring all bookings. Shared rooms require a responsible department assignment for approval routing. The Super Administrator has no room-booking access. All new bookings require approval by another Head of Department assigned to the room’s department (the requester’s department for shared rooms). The Super Administrator and Registrar have no access to schedule requests, change requests, or workload fixes, including queues, counts, history, and related notifications. Heads of Department publish validated semester activity proposals directly; there is no separate proposal approval step. Faculty retain access to their own requests and workload changes. Scheduling adjustment and constraint routes remain restricted to the Registrar and Heads of Department.

Database backup and disaster recovery remain deployment operations; this workflow does not add an in-app backup or restore facility.

## Enforcement contract

1. Apply `scopeQuery` before reading lists, searches, options, analytics, notifications, and exports.
2. Load mutation targets from storage through the caller’s scope. Never authorize a browser-supplied department identifier.
3. Call `can` (or a resource wrapper that calls it) against the stored owner immediately before mutation.
4. Return not found for missing and out-of-scope direct identifiers; return a readable forbidden error only for visible read-only resources.
