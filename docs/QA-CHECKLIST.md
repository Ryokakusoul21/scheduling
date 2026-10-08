# Manual QA checklist — Scheduler & Academic Management refactor

Automated tests: `npm test` (conflict detection, term overlap, timetable snapping/lanes,
"to schedule" maths, faculty/room ranking, card-flow URLs, RBAC route map, shortcut parsing).

Use the seeded demo accounts (password `Passw0rd!`): `admin@gcst.edu.ph` (Super Admin),
`scheduler@gcst.edu.ph` (Scheduler), `faculty@gcst.edu.ph` (Faculty), `student@gcst.edu.ph` (Student).
Test in Chrome and one other browser, at desktop and phone width (≤ 400 px).

## 1. Drag and drop

### Scheduler timetable (Super Admin)
- [ ] Scheduler → Level: College → Course: BSIT → Year: 1st → Section: BSIT 1A. Timetable shows its classes.
- [ ] Drag a class to another day/time. A dashed preview with the time range follows the pointer; on drop the block moves, a toast says "IT101 moved to …" with **Undo**.
- [ ] Click **Undo** → the class returns to its original slot.
- [ ] Reload the page → the move persisted.
- [ ] Drag a class onto a slot used by the same teacher/room in another section → block turns **red**, toast warns "… conflict", Conflicts badge count increases.
- [ ] Drag a block above 7:00 AM or below 7:00 PM → it is clamped inside the day.
- [ ] A short click on a block (no drag) opens the edit dialog instead of moving it.
- [ ] Two overlapping blocks in the same view are shown side by side (lanes), both readable.

### "To schedule" panel
- [ ] With a section selected, open **To schedule**. Subjects with remaining weekly hours are listed with a progress bar.
- [ ] Drag a subject onto the timetable → the Add class dialog opens with section, subject, day, and time pre-filled and the best faculty/room pre-selected.
- [ ] Save → the item's progress updates; when fully placed it disappears from the list.

### Reorderable lists
- [ ] Programs & Strands: drag a course card by its handle to a new position; reload → order kept.
- [ ] Subjects (any level/grade list), Sections (card grid), Rooms (buildings and rooms within a floor): drag to reorder; reload → order kept.
- [ ] While searching Rooms, drag handles are hidden (reordering a filtered list is disabled).
- [ ] Simulate a failure (e.g. stop the server mid-drag) → order rolls back and an error toast appears.

### Permissions
- [ ] Faculty/Student: Scheduler is read-only (no drag, no Add class, clicking a block does nothing harmful).
- [ ] Scheduler role: moving a **published** class sets it to *Review* (toast says so); Super Admin moves keep the status (no approval).
- [ ] Super Admin/Administrator see **Publish N** when drafts/review items are visible; it publishes them.

## 2. Keyboard

### Global
- [ ] `?` opens the shortcuts dialog listing General, Navigation, page-specific, Tables & lists, and Timetable groups. `Esc` closes it.
- [ ] `/` and `Ctrl+K` focus the global search; `↑`/`↓` move through results, `Enter` opens one, `Esc` closes the list then blurs.
- [ ] `g` then `s / y / p / u / e / f / r / d / n` navigates (Scheduler, Years, Programs, Subjects, Sections, Faculty, Rooms, Dashboard, Notifications). Faculty/Student accounts only get shortcuts for pages they can open.
- [ ] Shortcuts don't fire while typing in an input (type "g s" in search → nothing navigates).
- [ ] First `Tab` on any page shows **Skip to content**; activating it moves focus to the main area.
- [ ] Every focusable element shows a visible focus ring (sidebar links, cards, rows, blocks, buttons).

### Tables and card grids
- [ ] Subjects list / Faculty table / Scheduler table view / Rooms tables: `Tab` into the table, `↑`/`↓` move rows, `Home`/`End` jump, `Enter` opens the edit dialog.
- [ ] Card grids (levels, grades, programs, sections, faculty cards, quick actions): arrow keys move in 2D following the visible columns; `Enter` opens.
- [ ] Reorder by keyboard: focus a drag handle, `Space` picks up (screen reader announces position), `↑`/`↓` move, `Space` drops, `Esc` cancels.

### Timetable
- [ ] `Tab` into the timetable focuses the first class; arrows move between classes (↑↓ same day, ←→ nearest class on the adjacent day).
- [ ] `Enter` opens the edit dialog.
- [ ] `Space` picks up the class; arrows move it by 30 minutes / one day with the live preview; `Space` or `Enter` drops (saves); `Esc` cancels with no change.
- [ ] Scheduler page shortcuts: `n` add class, `t` timetable/table toggle, `c` jumps to the Conflicts list, `f` focuses the first filter.
- [ ] Dialogs: focus starts in the first field, `Enter` submits, `Esc` closes, focus returns to the trigger.

## 3. Conflict detection

- [ ] Create a conflict (Add class with the same teacher at the same time as another section's class). The dialog warns *before* saving ("Faculty is double-booked …") and the button reads **Save anyway**.
- [ ] After saving: both blocks are red with a warning icon; the **Conflicts** badge (header and side panel) shows the count.
- [ ] Conflicts panel lists the pair (both classes described). Clicking it switches filters to that section, shows the timetable, scrolls to and flashes the slot, and focuses it. **Show the other class** does the same for the second class.
- [ ] Room double-booking and section overlap are detected the same way (red).
- [ ] Capacity (section larger than room), wrong room type for a lab, and a teacher outside availability show as **amber warnings**, listed under "Warnings".
- [ ] A College 1st-semester class and an SHS Q1 class with the same teacher at the same time → conflict (terms overlap in dates).
- [ ] The same teacher in Q1 and Q2 at the same weekday/time → **no** conflict (quarters don't overlap).
- [ ] Fix a conflict by dragging one class away → red highlight and count clear immediately.
- [ ] Dashboard "Schedule conflicts" stat and "Needs attention" reflect the same count.
- [ ] Phone width: the **Conflicts** button opens the panel in a side sheet.

## 4. Academic setup

- [ ] Academic Years & Terms: create a year; open it; College → create default semesters for "All courses" and for one course; set one active (only one active per course/level).
- [ ] SHS / JHS / Elementary → "Create all 4 quarters" creates Q1–Q4 across the year; edit dates; deleting a term with classes is refused with a clear message.
- [ ] Programs: add a course (department required) and a strand; open the course page (year breakdown, links to Sections/Subjects/Scheduler).
- [ ] Subjects: Level → (College: course or General Education → year) / (Basic ed: grade) → add/edit/delete; SHS strand chips filter Core vs strand subjects.
- [ ] Sections: same flow; SHS sections require a strand; "Timetable" link opens the Scheduler on that section.
- [ ] Faculty: search, filter by level/department/status, switch cards/table; teaching levels saved; load bar turns red over max hours.
- [ ] Rooms: add building (gets a Ground Floor), add floor, add/move room between floors, delete refused while not empty; search highlights matches and expands their buildings.

## 5. Removed features

- [ ] No sidebar/menu entries for AI Auto Scheduler, Conflict Resolution, Schedule Manager, Schedule Calendar, Semesters, or Students.
- [ ] `/ai-scheduler`, `/conflicts`, `/schedules`, `/calendar` redirect to `/scheduler`; `/semesters` redirects to `/academic-years`; `/students` returns 404.
- [ ] AI Assistant answers still work and refer users to the Scheduler (not removed pages).

## 6. States & accessibility

- [ ] Each page shows a skeleton while loading, an empty state with an action when there's no data, and the error page with **Try again** on failure.
- [ ] Faculty account opening `/rooms` or `/admin/users` gets the **403 Access denied** page (HTTP 403).
- [ ] Screen reader (NVDA/VoiceOver): timetable blocks announce subject, day, time, people, status, and any conflict; drag-and-drop announces pick-up/move/drop.
- [ ] `prefers-reduced-motion` disables animations (pulse highlight, transitions).
- [ ] Dark mode: conflict red/amber and focus rings stay visible.
