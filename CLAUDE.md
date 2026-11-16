# CLAUDE.md

Guidance for Claude Code working with code in this repo.

## General Principles

- Generate concise, short solutions for new modules or code.
- Watch for over-engineering, oversized files needing refactor.
- Watch for weird syntax/style mismatching rest of codebase.
- Watch for obvious bugs.
- Prioritize concise, precise code and docs changes.
- No emojis or special characters in comments.
- Write activity-log.md in /docs to refer back if confused.
- Make to-do list, run major changes by user first.
- Review existing files before refactor or change.
- Markdown files use kebab naming (ex. some-description-changes.md).
- Don't auto-commit activity logs and docs.
- Comments: one-liner, one sentence.

## Naming Rules

- System title: "AI-Driven Faculty and Room Scheduling System".
- Institution name always in full: "GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY". Never abbreviate.
- No abbreviations anywhere in the system (labels, menus, buttons, reports, sample data).
  - "Head of Department" not "HOD", "Super Administrator" not "Super Admin", "Utilization Rate" not "Util.", etc.

## User Roles

- Faculty: view own schedule, book rooms, report unavailability, view own teaching load.
- Head of Department: all Faculty features (also teaches, has own load and class assignments), plus department management - approve schedules, manage department faculty, subjects, rooms, view department analytics.
- Super Administrator: everything the Registrar has, plus sole control of user accounts, system settings, and audit logs.
- Registrar: school-wide access to every department, term, room, schedule, examination, calendar, report; no user management.
- Student (view-only): own section timetable, room assignments, school activities; print and export them. Separate pages: /student/login, /student/register, /student/forgot-password, /student/reset-password.
- Login screen with role-based access; dashboard tailored per role.

## Academic Levels

- Strict rule: academic levels (College, Senior High School, Junior High School, Elementary, Pre-elementary) are never combined in one list, report, timetable, or record.
- Lists show one level at a time through level tabs (`components/academics/level-tabs.tsx`); College is the default.
- A class or examination needs its section, subject, and term in the same level; faculty must teach that level.
- Exceptions: shared physical resources (rooms, faculty totals in Workload) and school-wide calendar activities (explicit "All levels").

## Core Features

1. Class and Examination Scheduling
   - Class timetables: subject, section, faculty, room, day, time.
   - Examinations: date, time, room, proctor, subject, section; conflict detection for rooms, proctors, sections.
2. Calendar of Activities
   - Month, week, day views: classes, examinations, room bookings, school events, holidays, class suspensions.
   - Add, edit, delete activities; color coded by type.
3. Room Booking with Automatic Conflict Resolution
   - Available to Faculty, Head of Department, Registrar.
   - On conflict, auto-reschedule the existing schedule to nearest available room or time slot satisfying capacity, room type, faculty availability.
   - Show what moved and why, notify affected faculty, allow undo.
4. Bulk and Individual Data Entry
   - Subjects and rooms: single form, or bulk via CSV/spreadsheet upload and paste-in table.
   - Downloadable import template, error validation, preview before saving.
5. Automated Timetable Analytics
   - Room Utilization Rate (per room, per building, overall).
   - Faculty Utilization Rate (per faculty member, per department).
   - Peak scheduling hours heatmap (day by hour).
   - Charts and tables, filterable by semester and department.
6. Faculty Workload Optimization (AI-powered)
   - Balance load so no faculty is overloaded or underloaded.
   - Show current load against minimum and maximum units or hours (configurable by Super Administrator).
   - Flag overloaded and underloaded faculty; suggest or auto-apply reassignments with explanation.
   - Require Head of Department or Registrar approval before applying.
7. Dynamic Schedule Adjustment
   - Auto-regenerate affected schedules when a faculty member becomes unavailable, classes are suspended (single day, multiple days, specific sections), or a room becomes unavailable.
   - Show before-and-after comparison, list every affected class, offer make-up class options for suspensions, notify everyone affected.

## Light Text Rule (Strict)

- Every screen must be light on text: scannable at a glance, never paragraphs or repeated wording.
- Show a value once; never repeat the same label, section, or name across rows or lines.
- Hide defaults and empty values ("All levels", "Not set", "None"); show only what is specific.
- Prefer chips, badges, icons, counts, and short labels over sentences; one-line descriptions and helper text at most.
- Put detail behind a click (collapsible card, drawer, dialog); summarize first, expand on demand.
- Group and collapse long lists (by month, section, or status); show past or low-priority items collapsed.
- Use one consistent format for dates, times, and ranges.
- Applies to new pages, redesigns, dialogs, empty states, and error messages.

## Design and Technical Requirements

- Clean, modern, responsive interface; sidebar navigation; "GRANBY COLLEGES OF SCIENCE AND TECHNOLOGY" in header; light and dark modes.
- Realistic fictional sample data (departments, faculty, subjects, rooms, sections) so every feature demos immediately.
- Search, filters, and export to PDF and spreadsheet for timetables and reports.
- Prevent double-booking of rooms, faculty, and student sections at all times.
- Code well organized and commented.

## Code Quality

- Right data structures and algorithms for problem.
- Don't expose data needlessly (least privilege).
- No external libraries unless absolutely necessary.
- Use project dependency file for correct versions.
- Avoid redundancy unless improves usability.

## Version Control

- Commit after significant changes, clear messages.
- Keep commits focused, atomic.
- No auto-push any branch.

## AI Restrictions

- No customer personal data - names, contacts, account numbers, transactions (unless approved exemption).
- No credentials - passwords, API keys, tokens, connection strings.
  - Approved exemption: fictional demo and seed account logins (local development only) may be read and shared with the user.
