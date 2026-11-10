# Graph Report - scheduling  (2026-11-10)

## Corpus Check
- 571 files · ~316,613 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 5 file(s) not represented in the graph (top: (none) 1, .ico 1, .css 1)

## Summary
- 3628 nodes · 14187 edges · 139 communities (131 shown, 8 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 240 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `27631264`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- specs.ts
- portal.ts
- actions/auth.ts
- DialogContent
- service.ts
- scheduler-workspace.tsx
- proposals.tsx
- StatusPage
- report-table.tsx
- Badge
- overview.tsx
- bookings/plan.ts
- dependencies
- prisma.ts
- engine.ts
- scheduler/timetable.ts
- seed.ts
- optimizer.ts
- policy.ts
- bookings/actions.ts
- adjustment-workspace.tsx
- Obsidian Bases Skill
- theme-provider.tsx
- levels.ts
- (dashboard)/subjects/page.tsx
- Obsidian Flavored Markdown Skill
- lib/scheduler/types.ts
- 2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler)
- scheduler-workspace.tsx
- zod
- components.json
- export-buttons.tsx
- Input
- requests-table.tsx
- FieldGroup
- shortcuts.tsx
- users/actions.ts
- compilerOptions
- solver.ts
- levelLabel
- devDependencies
- sections.tsx
- nav-config.ts
- Card
- scheduler/actions.ts
- Button
- JSON Canvas Skill
- search-form.tsx
- proposals/actions.ts
- calendar-board.tsx
- Skeleton
- office-dashboards.tsx
- class-dialog.tsx
- constraints.ts
- actions/archive.ts
- exam-workspace.tsx
- resolve-actions.ts
- (dashboard)/calendar/page.tsx
- use-scheduler-filters.ts
- avatar/route.ts
- roles.ts
- System Overview
- solver.ts
- AvatarDialog
- booking-drawer.tsx
- availability-form.tsx
- view.ts
- subject-plan.test.ts
- timetables/actions.ts
- building-dialogs.tsx
- assistant/actions.ts
- EmptyState
- package.json
- auth.ts
- requireScope
- CLAUDE.md
- Activity Log
- termLabel
- role-dashboards.tsx
- request-form-modal.tsx
- department-staffing-summary.ts
- constraints/manager.tsx
- terms-manager.tsx
- routes.ts
- student/timetable.tsx
- topbar.tsx
- Field
- next
- requireRole
- next
- chart.tsx
- toast.tsx
- UserAvatar
- Manual QA checklist — Scheduler & Academic Management refactor
- Obsidian CLI
- 2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5)
- 2026-10-29 - Head of Department scope, merged Scheduler (steps 1 to 3)
- README.md
- 2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities
- states.tsx
- 2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user)
- exam-workspace.tsx
- 2026-10-30 Scheduler improvements, Phase 2
- Knap
- This is NOT the Next.js you know
- ProposalCard
- card.tsx
- curriculum-list.tsx
- review.ts
- breadcrumbs.tsx
- postcss.config.mjs
- 2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements)
- scripts
- 2026-10-31 Login and dashboard redesign (UI only)
- affected.ts
- Defuddle
- users/manager.tsx
- auto-generate-dialog.tsx
- notifications-list.tsx
- tabs.tsx
- ResolveIssues
- LegalPage
- @prisma/adapter-pg
- scheduleAssistant.ts
- proposals/page.tsx
- eslint.config.mjs
- request-change-modal.tsx
- allowScripts
- Permission Matrix
- narrative.ts
- next-auth
- (dashboard)/notifications/page.tsx
- progress.tsx
- @tanstack/react-query
- clsx@^2.1.1
- nodemailer
- prisma@7.10.0
- qrcode
- react-dom

## God Nodes (most connected - your core abstractions)
1. `Button()` - 231 edges
2. `@phosphor-icons/react` - 144 edges
3. `react` - 142 edges
4. `next` - 138 edges
5. `requireScope()` - 137 edges
6. `Badge()` - 125 edges
7. `prisma` - 121 edges
8. `formatRange()` - 119 edges
9. `Card()` - 102 edges
10. `CardContent()` - 85 edges

## Surprising Connections (you probably didn't know these)
- `Timetable` --references--> `n()`  [INFERRED]
  docs/QA-CHECKLIST.md → app/(dashboard)/constraints/categories.ts
- `Design notes` --references--> `RoomsExplorer()`  [INFERRED]
  docs/activity-log.md → app/(dashboard)/rooms/rooms-explorer.tsx
- `9. DevOps and Deployment` --references--> `start()`  [INFERRED]
  docs/SYSTEM_OVERVIEW.md → components/scheduler/resolve-issues.tsx
- `14. Gaps and Recommendations` --references--> `requireScope()`  [INFERRED]
  docs/SYSTEM_OVERVIEW.md → lib/permissions/scope.ts
- `Progress (all done, 11 commits 773d893..6e2b15b)` --references--> `weeklyDoubleBooking()`  [INFERRED]
  docs/activity-log.md → lib/scheduler/term-conflicts.ts

## Import Cycles
- None detected.

## Communities (139 total, 8 thin omitted)

### Community 0 - "specs.ts"
Cohesion: 0.11
Nodes (31): validateImportAction(), ImportWorkspace(), load(), onFile(), save(), KIND_LABELS, columnIndex(), inflate() (+23 more)

### Community 1 - "portal.ts"
Cohesion: 0.13
Nodes (27): metadata, StudentDashboardPage(), metadata, StudentSchedulePage(), metadata, shortDay(), StudentSubjectsPage(), ActivityTypeBadge() (+19 more)

### Community 2 - "actions/auth.ts"
Cohesion: 0.11
Nodes (33): ActionResult, Audience, fieldErrors(), findUserByEmail(), forgotPasswordAction(), ip(), matchesAudience(), registerAction() (+25 more)

### Community 3 - "DialogContent"
Cohesion: 0.15
Nodes (40): BookDialog(), classes(), slot(), EditDialog(), ActivityDialog(), save(), CalendarBoard(), EventDialog() (+32 more)

### Community 4 - "service.ts"
Cohesion: 0.10
Nodes (49): BookingsPage(), departmentExtras(), DepartmentExtras, allowedPriorities(), canManageBooking(), canReviewOverride(), capStatus(), isOverride() (+41 more)

### Community 5 - "scheduler-workspace.tsx"
Cohesion: 0.08
Nodes (45): collision(), gridKeyboardCoordinates(), ResolveRequest, RowInfo, ActiveDrag, PanelKey, SchedulerWorkspace(), dropTarget() (+37 more)

### Community 6 - "proposals.tsx"
Cohesion: 0.16
Nodes (22): recheckWorkloadAction(), MyLoad(), Stat(), Summary, WorkloadBoard(), recheck(), PrintHeader(), FixLog() (+14 more)

### Community 7 - "StatusPage"
Cohesion: 0.33
Nodes (6): ForbiddenPage(), metadata, Forbidden(), metadata, Unauthorized(), StatusPage()

### Community 8 - "report-table.tsx"
Cohesion: 0.08
Nodes (37): ActivitiesTable(), COLUMNS, dateText(), levelText(), SORT_VALUE, SortKey, timeText(), TYPES (+29 more)

### Community 9 - "Badge"
Cohesion: 0.21
Nodes (28): AuditLogsPage(), metadata, ReviewInbox(), ReviewKind, ReviewTab, ArchivedList(), when(), AnalyticsCharts() (+20 more)

### Community 10 - "overview.tsx"
Cohesion: 0.15
Nodes (24): StatGrid(), ClassFocus(), STYLES, StudentLanding(), line(), MovedList(), Hint(), OverviewSkeleton() (+16 more)

### Community 11 - "bookings/plan.ts"
Cohesion: 0.07
Nodes (38): BatchView, ReportView, AdjustmentsPage(), CAUSE_LABELS, metadata, approvalDepartment(), BookingMeta, BookingPlan (+30 more)

### Community 12 - "dependencies"
Cohesion: 0.07
Nodes (27): dependencies, @auth/prisma-adapter@^2.11.3, @base-ui/react@^1.8.0, bcryptjs@^3.0.3, class-variance-authority@^0.7.1, cn@^0.3.0, date-fns@^4.4.0, @dnd-kit/core@^6.3.1 (+19 more)

### Community 13 - "prisma.ts"
Cohesion: 0.09
Nodes (37): dynamic, metadata, SettingsPage(), metadata, metadata, day(), ExamMode(), location() (+29 more)

### Community 14 - "engine.ts"
Cohesion: 0.08
Nodes (55): plan(), activityConflicts(), roomFree(), addMakeUp(), BookingRequest, findMakeUpOptions(), item(), notifyPlan() (+47 more)

### Community 15 - "scheduler/timetable.ts"
Cohesion: 0.12
Nodes (31): TIMES, DAYS, GridEntry, WeekGrid(), describeOther(), target(), Block, DayColumn() (+23 more)

### Community 16 - "seed.ts"
Cohesion: 0.08
Nodes (35): applyPlan(), dayOfWeek(), addArchiveAndApprovalSamples(), date(), today(), weekday(), addBookingSamples(), JS_DAYS (+27 more)

### Community 17 - "optimizer.ts"
Cohesion: 0.16
Nodes (27): 2026-11-01 Always-balanced workload with Head of Department approval, amountOf(), basisOf(), describeMove(), explain(), hoursOf(), isFree(), loadReport() (+19 more)

### Community 18 - "policy.ts"
Cohesion: 0.08
Nodes (46): deleteProgramAction(), renameDepartmentAction(), renameSchema, Result, revalidate(), saveProgramAction(), schema, ProgramsPage() (+38 more)

### Community 19 - "bookings/actions.ts"
Cohesion: 0.06
Nodes (54): restore(), respond(), availabilityAction(), bookingTimelineAction(), bookRoomAction(), bookSchema, cancelBookingAction(), Caps (+46 more)

### Community 20 - "adjustment-workspace.tsx"
Cohesion: 0.12
Nodes (34): AdjustmentRequest, applyAdjustmentAction(), authorize(), base, batchEnd(), batchScope(), checked(), choiceSchema (+26 more)

### Community 21 - "Obsidian Bases Skill"
Cohesion: 0.05
Nodes (42): Any Type Functions, Date Arithmetic, Date Functions & Fields, Duration Type, File Functions, Functions Reference, Global Functions, Link Functions (+34 more)

### Community 22 - "theme-provider.tsx"
Cohesion: 0.15
Nodes (20): geistMono, inter, jakarta, metadata, RootLayout(), Providers(), toggleTheme(), Toaster() (+12 more)

### Community 23 - "levels.ts"
Cohesion: 0.11
Nodes (30): GlobalSearch(), handleChange(), handleKeyDown(), handleSelect(), GROUP_ICONS, globalSearchAction(), SearchResult, Filters (+22 more)

### Community 24 - "(dashboard)/subjects/page.tsx"
Cohesion: 0.12
Nodes (27): metadata, SectionsPage(), SectionTermFilters(), metadata, SubjectsPage(), Countable, LevelFlow(), Breadcrumbs() (+19 more)

### Community 25 - "Obsidian Flavored Markdown Skill"
Cohesion: 0.05
Nodes (33): Basic Callout, Callouts Reference, Custom Callouts (CSS), Foldable Callouts, Nested Callouts, Supported Callout Types, Embed Audio, Embed Bases (+25 more)

### Community 26 - "lib/scheduler/types.ts"
Cohesion: 0.07
Nodes (35): ConflictContext, detectConflicts(), MAX_DAILY_MINUTES, push(), termsConcurrent(), FacultyWithAvailability, RoomWithAvailability, toSchedFaculty() (+27 more)

### Community 27 - "2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler)"
Cohesion: 0.33
Nodes (6): 2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler), Decisions (confirmed with the user), Design notes, Gotchas, Progress (all done, 11 commits 773d893..6e2b15b), Verification

### Community 28 - "scheduler-workspace.tsx"
Cohesion: 0.09
Nodes (41): ChangeList(), classSheets(), examConflicts(), ExamTable(), fmt(), metadata, TimetableReviewPage(), CommentBox() (+33 more)

### Community 29 - "zod"
Cohesion: 0.07
Nodes (46): allOwned(), PATHS, schema, activeTerm(), commitImportAction(), recordsSchema, Result, validate() (+38 more)

### Community 30 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 31 - "export-buttons.tsx"
Cohesion: 0.11
Nodes (33): exportRows(), ExportButtons(), ReportButtons(), RoomAssignmentRow, RoomAssignmentsReportButtons(), TimetableReportButtons(), withoutQuarterTerms(), 3. Frontend (+25 more)

### Community 32 - "Input"
Cohesion: 0.17
Nodes (14): CorrectionForm(), days, time(), EmergencyAccessPage(), metadata, Clock, DURATIONS, Form (+6 more)

### Community 33 - "requests-table.tsx"
Cohesion: 0.24
Nodes (12): RuleActions(), RowMenu(), SubjectRowActions(), Topbar(), DropdownMenu(), DropdownMenuContent(), DropdownMenuItem(), DropdownMenuLabel() (+4 more)

### Community 34 - "FieldGroup"
Cohesion: 0.11
Nodes (27): requiresAdminApproval(), resendVerificationAction(), GET(), ForgotPasswordPage(), metadata, LoginPage(), metadata, NOTICES (+19 more)

### Community 35 - "shortcuts.tsx"
Cohesion: 0.23
Nodes (12): Kbd(), Ctx, isTypingTarget(), NAV_SHORTCUTS, prettyKeys(), ShortcutContext, ShortcutDef, ShortcutGroup() (+4 more)

### Community 36 - "users/actions.ts"
Cohesion: 0.16
Nodes (24): ADMIN, approveUserAction(), createSchema, updateSchema, handleApprove(), 2026-10-16 - Printing, constraints, room designation, Student role, Decisions (confirmed with the user), Gotchas (+16 more)

### Community 37 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 38 - "solver.ts"
Cohesion: 0.22
Nodes (27): unresolved(), attempt(), backtrack(), blockers(), change(), check(), commit(), displace() (+19 more)

### Community 39 - "levelLabel"
Cohesion: 0.15
Nodes (31): AnalyticsPage(), metadata, AdminPanels(), Card, dashboardAnalytics(), DashboardFilters, pctText(), previousTerm() (+23 more)

### Community 40 - "devDependencies"
Cohesion: 0.09
Nodes (22): devDependencies, tailwindcss@^4, @tailwindcss/postcss@^4, tsx@^4.23.13, @types/node@^20, @types/nodemailer@^8.0.2, @types/pg@^8.23.1, @types/qrcode@^1.5.6 (+14 more)

### Community 41 - "sections.tsx"
Cohesion: 0.15
Nodes (23): ActivityEntry, dayKey(), getActiveTerms, getAdminCounts, getRecentActivity, getToday, getUrgentMoves, getWorkload (+15 more)

### Community 42 - "nav-config.ts"
Cohesion: 0.13
Nodes (27): DashboardLayout(), StudentPortalLayout(), MobileNav(), activeHrefFor(), ADMIN, allowedHrefsForRole(), collapse(), filterNavForRole() (+19 more)

### Community 43 - "Card"
Cohesion: 0.09
Nodes (60): updateBookingSettingsAction(), SettingsManager(), handleBooking(), ViewAsPage(), Option, TABLES, Totals, Stat() (+52 more)

### Community 44 - "scheduler/actions.ts"
Cohesion: 0.06
Nodes (64): bulkReviewAction(), inputSchema, refresh(), Result, decide(), classSchema, DAY, deleteClassAction() (+56 more)

### Community 45 - "Button"
Cohesion: 0.11
Nodes (29): decideTimetableAction(), Decision, DecisionPanel(), decide(), AcknowledgementPanel(), DashboardError(), ProgramsError(), DepartmentRow (+21 more)

### Community 46 - "JSON Canvas Skill"
Cohesion: 0.08
Nodes (26): Flowchart, JSON Canvas Complete Examples, Project Board with Groups, Research Canvas with Files and Links, Simple Canvas with Text and Connections, 1. Create a New Canvas, 2. Add a Node to an Existing Canvas, 3. Connect Two Nodes (+18 more)

### Community 47 - "search-form.tsx"
Cohesion: 0.11
Nodes (26): AckRow, BookingRow, MoveRow, daysBetween(), formatDay(), manilaClock(), relativeDay(), TIME_ZONE (+18 more)

### Community 48 - "proposals/actions.ts"
Cohesion: 0.10
Nodes (34): day(), Input, previewProposalAction(), proposalSchema, refresh(), Result, rowSchema, saveProposalDraftAction() (+26 more)

### Community 49 - "calendar-board.tsx"
Cohesion: 0.06
Nodes (53): ActivityInput, ApprovalsBoard(), decide(), Decision, DECISION_LABEL, when(), BLANK, CalendarEvent (+45 more)

### Community 50 - "Skeleton"
Cohesion: 0.24
Nodes (8): Loading(), Loading(), Loading(), Loading(), Loading(), SchedulerLoading(), Loading(), Skeleton()

### Community 51 - "office-dashboards.tsx"
Cohesion: 0.13
Nodes (30): dashboardLink, ICON_TONES, LandingMetrics(), METRIC_ICONS, AdministratorDashboard(), RegistrarDashboard(), timestamp(), QuietState() (+22 more)

### Community 52 - "class-dialog.tsx"
Cohesion: 0.15
Nodes (18): ClassInput, ClassDialog(), ClassDraft, ClassForm(), STATUS_OPTIONS, ConflictContextBuilder, ScheduleStatus, Booking (+10 more)

### Community 53 - "constraints.ts"
Cohesion: 0.13
Nodes (20): applies(), APPLIES_TO, clock(), CONSTRAINT_KINDS, ConstraintParams, DAY, DAY_NAMES, dayLine() (+12 more)

### Community 54 - "actions/archive.ts"
Cohesion: 0.11
Nodes (26): allowed(), archiveRecordAction(), ArchiveResult, departmentOf(), PATHS, REFUSED, restoreRecordAction(), schema (+18 more)

### Community 55 - "exam-workspace.tsx"
Cohesion: 0.07
Nodes (36): ExamData, ExamRecord, addDay(), AutoScheduleClass, AutoScheduleExisting, AutoScheduleProposal, AutoScheduleResult, AutoScheduleRoom (+28 more)

### Community 56 - "resolve-actions.ts"
Cohesion: 0.06
Nodes (68): BookingsList(), classes(), COLUMNS, Tab, revokeSessionAction(), cancelRequestAction(), createRequestAction(), day() (+60 more)

### Community 57 - "(dashboard)/calendar/page.tsx"
Cohesion: 0.18
Nodes (16): CalendarPage(), longDate(), metadata, Tab, VIEWS, BuildingPage(), metadata, RoomsPage() (+8 more)

### Community 58 - "use-scheduler-filters.ts"
Cohesion: 0.18
Nodes (17): SectionOption, ACTIVE_TERMS, DEPENDENTS, KEYS, sectionMatches(), useSchedulerFilters(), YEAR_LEVELS, ALL_ACTIVE_TERMS (+9 more)

### Community 59 - "avatar/route.ts"
Cohesion: 0.16
Nodes (17): GET(), ACTIONS, DELETE(), guard(), POST(), record(), getSession(), AVATAR_FILE_RE (+9 more)

### Community 60 - "roles.ts"
Cohesion: 0.12
Nodes (17): metadata, AvailabilityPage(), metadata, FacultyPage(), metadata, metadata, submitClassesAction(), confirmSubmit() (+9 more)

### Community 61 - "System Overview"
Cohesion: 0.13
Nodes (13): 10. Testing and Code Quality, 11. Security Observations, 12. How to Run Locally, 13. Architecture Diagram, 14. Gaps and Recommendations, 1. Project Overview, 2. Tech Stack Summary, 6. APIs (+5 more)

### Community 62 - "solver.ts"
Cohesion: 0.08
Nodes (51): toggle(), COUNTS, Labels, ResolveReview(), slot(), Message, ResolverProgress, ConstraintContext (+43 more)

### Community 63 - "AvatarDialog"
Cohesion: 0.17
Nodes (14): AvatarButton(), AvatarDialog(), capture(), change(), fail(), remove(), stopCamera(), upload() (+6 more)

### Community 64 - "booking-drawer.tsx"
Cohesion: 0.13
Nodes (31): Compare(), DOT, fields, RequestDrawer(), Step, timeline(), ICONS, RequestTypeBadge() (+23 more)

### Community 65 - "availability-form.tsx"
Cohesion: 0.29
Nodes (9): ImpactItem, previewMyUnavailabilityAction(), withdrawReportAction(), AvailabilityForm(), preview(), submit(), ReportRow, STATUS (+1 more)

### Community 66 - "view.ts"
Cohesion: 0.20
Nodes (20): approveRow(), awaitingLabel(), canApprove(), canEdit(), canReject(), isCrossDepartment(), isOpen(), Reviewer (+12 more)

### Community 67 - "subject-plan.test.ts"
Cohesion: 0.09
Nodes (32): AssignFacultyModal(), save(), EMPLOYMENT, when(), assignmentConflictsAction(), day(), subjectDetailsAction(), AssignContext (+24 more)

### Community 68 - "timetables/actions.ts"
Cohesion: 0.26
Nodes (10): addTimetableCommentAction(), commentSchema, decisionSchema, refresh(), Result, fmt(), HeadNotices(), weekAgo() (+2 more)

### Community 69 - "building-dialogs.tsx"
Cohesion: 0.16
Nodes (18): STYLE, BuildingDetails, BuildingDialog(), BuildingBanner(), BuildingSummary, RoomReportRow, Sort, SORTS (+10 more)

### Community 70 - "assistant/actions.ts"
Cohesion: 0.19
Nodes (17): ChatMessage, clearAssistantHistoryAction(), getAssistantHistory(), latestConversation(), messageSchema, sendAssistantMessageAction(), toChatMessage(), AssistantPage() (+9 more)

### Community 71 - "EmptyState"
Cohesion: 0.12
Nodes (43): reorderAction(), FacultyBrowser(), FacultyRow, STATUS, programFields(), ProgramRow, ProgramSection(), ProgramsManager() (+35 more)

### Community 72 - "package.json"
Cohesion: 0.11
Nodes (17): cmdk@^1.1.1, @dnd-kit/sortable@^10.0.0, @dnd-kit/utilities@^3.2.2, openai@^7.17.0, shadcn@^4.21.0, sharp@^0.35.4, tw-animate-css@^1.4.0, name (+9 more)

### Community 73 - "auth.ts"
Cohesion: 0.07
Nodes (30): GET, POST, body, POST(), Notification, credentialsSchema, handlers, signIn (+22 more)

### Community 74 - "requireScope"
Cohesion: 0.06
Nodes (53): departmentSchema, Result, DepartmentManagementPage(), metadata, formSchema, Result, metadata, SchedulingPeriodsPage() (+45 more)

### Community 75 - "CLAUDE.md"
Cohesion: 0.20
Nodes (8): AI Restrictions, Code Quality, Core Features, Design and Technical Requirements, General Principles, Naming Rules, User Roles, Version Control

### Community 76 - "Activity Log"
Cohesion: 0.09
Nodes (21): 2026-10-14 - Role dashboards (commit 752bf31), 2026-10-31 Mobile and tablet pass (code review, no browser), 2026-10-31 Room Booking redesign (UI only), 2026-10-31 Scheduler: Resolve issues, 2026-10-31 Scheduling Constraints redesign (UI only), 2026-10-31 Speed pass, 2026-11-01 Room booking urgent override (Phase A), 2026-11-01 Subject Assigning (+13 more)

### Community 77 - "termLabel"
Cohesion: 0.20
Nodes (14): deleteAcademicYearAction(), setActiveAcademicYearAction(), AcademicYearDetailPage(), metadata, AcademicYearsPage(), FIELDS, fmt(), Year (+6 more)

### Community 78 - "role-dashboards.tsx"
Cohesion: 0.18
Nodes (19): DashboardPage(), LANDING, metadata, KpiSkeleton(), SectionSkeleton(), BRAND_THEME, DashboardBanner(), dashboardTheme() (+11 more)

### Community 79 - "request-form-modal.tsx"
Cohesion: 0.12
Nodes (21): clock(), dayName(), DAYS, Label(), Problem(), RequestFormModal(), ScheduleCombobox(), ScheduleOption (+13 more)

### Community 80 - "department-staffing-summary.ts"
Cohesion: 0.27
Nodes (8): assignmentLoad(), DepartmentInput, DepartmentStaffingRow, FacultyInput, round1(), summarizeDepartmentStaffing(), WorkloadMeasure, Assignment

### Community 81 - "constraints/manager.tsx"
Cohesion: 0.12
Nodes (36): Regular Expression Functions, CATEGORIES, Category, categoryOf(), ConstraintRow, CREATE_CATEGORIES, CreateCategory, createCategoryOf() (+28 more)

### Community 82 - "terms-manager.tsx"
Cohesion: 0.19
Nodes (21): activateTerm(), createDefaultTermsAction(), deleteTermAction(), Result, revalidate(), saveAcademicYearAction(), saveTermAction(), setActiveTermAction() (+13 more)

### Community 83 - "routes.ts"
Cohesion: 0.19
Nodes (11): authConfig, isPublicPath(), PUBLIC_PATHS, ADMIN_ROLES, SUPER_ROLES, canAccessPath(), isStudentArea(), rolesForPath() (+3 more)

### Community 84 - "student/timetable.tsx"
Cohesion: 0.24
Nodes (15): MovedTag(), DayAgenda(), ListView(), mergeRuns(), options(), ComponentTag(), shortDay(), StudentTimetable() (+7 more)

### Community 85 - "topbar.tsx"
Cohesion: 0.32
Nodes (13): EventCell(), Details(), NavGroups(), readClosed(), Sidebar(), subscribeClosed(), useActiveHref(), Label() (+5 more)

### Community 86 - "Field"
Cohesion: 0.09
Nodes (36): studentRegisterAction(), FacultyLinkField(), StudentRegisterPage(), Captcha(), captchaEnabled, loadScript(), Window, DEMO_ACCOUNTS (+28 more)

### Community 87 - "next"
Cohesion: 0.06
Nodes (66): emergencyCorrectionAction(), schema, ADMIN, bookingSchema, schema, time, workloadSchema, reportUnavailabilityAction() (+58 more)

### Community 88 - "requireRole"
Cohesion: 0.10
Nodes (32): updateInstitutionAction(), updateWorkloadAction(), handleSave(), handleWorkload(), createUserAction(), updateUserAction(), handleCreate(), handleUpdate() (+24 more)

### Community 89 - "next"
Cohesion: 0.23
Nodes (13): Program, assignDepartmentHeadAction(), refreshDepartments(), removeDepartmentHeadAssignmentAction(), saveDepartmentAction(), Department, DepartmentManager(), assign() (+5 more)

### Community 90 - "chart.tsx"
Cohesion: 0.22
Nodes (12): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartStyle(), ChartTooltipContent(), getPayloadConfigFromPayload() (+4 more)

### Community 91 - "toast.tsx"
Cohesion: 0.26
Nodes (13): toast, Toast(), ToastAction(), ToastClose(), ToastContent(), ToastDescription(), Toaster(), ToastIcon() (+5 more)

### Community 92 - "UserAvatar"
Cohesion: 0.27
Nodes (8): Avatar(), AvatarFallback(), AvatarImage(), colorOf(), COLORS, initials(), UserAvatar(), smallAvatarUrl()

### Community 93 - "Manual QA checklist — Scheduler & Academic Management refactor"
Cohesion: 0.13
Nodes (14): 1. Drag and drop, 2. Keyboard, 3. Conflict detection, 4. Academic setup, 5. Removed features, 6. States & accessibility, Global, Manual QA checklist — Scheduler & Academic Management refactor (+6 more)

### Community 94 - "Obsidian CLI"
Cohesion: 0.20
Nodes (9): Additional developer commands, Command reference, Common patterns, Develop/test cycle, File targeting, Obsidian CLI, Plugin development, Syntax (+1 more)

### Community 95 - "2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5)"
Cohesion: 0.67
Nodes (3): 2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5), Gotchas, What changed

### Community 96 - "2026-10-29 - Head of Department scope, merged Scheduler (steps 1 to 3)"
Cohesion: 0.67
Nodes (3): 2026-10-29 - Head of Department scope, merged Scheduler (steps 1 to 3), Decisions (confirmed with the user), Gotchas

### Community 97 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 98 - "2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities"
Cohesion: 0.67
Nodes (3): 2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities, Decisions (confirmed with the user), Gotchas

### Community 99 - "states.tsx"
Cohesion: 0.10
Nodes (25): fmt(), metadata, QUEUES, ReviewCenterPage(), words(), ReviewRow, localDate(), saveSchedulingPeriodAction() (+17 more)

### Community 100 - "2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user)"
Cohesion: 0.67
Nodes (3): 2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user), Decisions (confirmed with the user), Design notes

### Community 101 - "exam-workspace.tsx"
Cohesion: 0.11
Nodes (33): moveExamAction(), addDays(), classKey(), ClassRef, DATE_DAYS, DAYS, defaultsFor(), Draft (+25 more)

### Community 102 - "2026-10-30 Scheduler improvements, Phase 2"
Cohesion: 0.67
Nodes (3): 2026-10-30 Scheduler improvements, Phase 2, Changes, Gotchas

### Community 103 - "Knap"
Cohesion: 0.33
Nodes (5): Batch rendering, Defuddle pipeline, Knap, Templates, Usage

### Community 105 - "ProposalCard"
Cohesion: 0.23
Nodes (15): approveProposalAction(), editProposalRowAction(), rejectProposalAction(), PendingFixes(), approve(), reject(), report(), isOpen() (+7 more)

### Community 106 - "card.tsx"
Cohesion: 0.08
Nodes (47): audit(), changePasswordAction(), confirmTwoFactorAction(), disableTwoFactorAction(), issueRecoveryCodes(), regenerateRecoveryCodesAction(), Result, signOutEverywhereAction() (+39 more)

### Community 107 - "curriculum-list.tsx"
Cohesion: 0.08
Nodes (38): CATEGORY_LABEL, CurriculumList(), PAGE_SIZES, FacultyPopover(), groupByFaculty(), sectionsOf(), RowAction, CategoryBadge() (+30 more)

### Community 108 - "review.ts"
Cohesion: 0.22
Nodes (14): proposalOutcome(), applyMoves(), proposalBasis(), proposalFaculty(), WorkloadData, Move, actorOf(), departmentSummary() (+6 more)

### Community 109 - "breadcrumbs.tsx"
Cohesion: 0.29
Nodes (8): BreadcrumbItem, buildBreadcrumbs(), CONTEXTUAL, LEVEL_LABELS, PAGE_LABELS, pageLabel(), parentTrail(), QUEUE_LABELS

### Community 111 - "2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements)"
Cohesion: 0.40
Nodes (5): 2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements), Changes, Decisions (user), Findings, Gotchas

### Community 112 - "scripts"
Cohesion: 0.22
Nodes (9): scripts, audit:owners, build, dev, lint, postinstall, start, test (+1 more)

### Community 113 - "2026-10-31 Login and dashboard redesign (UI only)"
Cohesion: 0.40
Nodes (5): 2026-10-31 Login and dashboard redesign (UI only), App shell, Dashboard, Gotchas, Login

### Community 114 - "affected.ts"
Cohesion: 0.36
Nodes (6): activityApplies(), Affect, affectsOf(), ReportActivity, ReportClass, cls

### Community 115 - "Defuddle"
Cohesion: 0.50
Nodes (3): Defuddle, Output formats, Usage

### Community 116 - "users/manager.tsx"
Cohesion: 0.26
Nodes (13): removeUserAvatarAction(), resetPasswordAction(), ROLES, Row, UsersManager(), handleRemovePhoto(), handleReset(), removeProgramAssignmentAction() (+5 more)

### Community 117 - "auto-generate-dialog.tsx"
Cohesion: 0.49
Nodes (7): AutoGenerateDialog(), distributeLearners(), generateSectionNames(), nextSectionIndex(), sectionSuffix(), sectionSuffixIndex(), sectionSummary()

### Community 118 - "notifications-list.tsx"
Cohesion: 0.28
Nodes (10): markAllNotificationsReadAction(), markNotificationReadAction(), ICONS, NotificationsList(), TINTS, metadata, StudentNotificationsPage(), currentSession (+2 more)

### Community 119 - "tabs.tsx"
Cohesion: 0.24
Nodes (5): ScrollArea(), ScrollBar(), TabsList(), tabsListVariants, @base-ui/react

### Community 120 - "ResolveIssues"
Cohesion: 0.27
Nodes (12): narrateRepairAction(), repairStampAction(), KIND_LABELS, Phase, ResolveIssues(), apply(), close(), start() (+4 more)

### Community 121 - "LegalPage"
Cohesion: 0.39
Nodes (5): metadata, PrivacyPage(), metadata, TermsPage(), LegalPage()

### Community 122 - "@prisma/adapter-pg"
Cohesion: 0.25
Nodes (5): @prisma/adapter-pg@^7.10.0, dotenv@^17.4.2, dotenv, @prisma/adapter-pg, prisma

### Community 123 - "scheduleAssistant.ts"
Cohesion: 0.23
Nodes (14): ASSISTANT_MODEL, AssistantTurn, buildContext(), buildStaffOverview(), DAY_ORDER, floorSelect, fmtTime(), formatSchedule() (+6 more)

### Community 124 - "proposals/page.tsx"
Cohesion: 0.24
Nodes (9): CalendarTab, CalendarTabs(), ActivityProposalsPage(), formatDate(), metadata, SchedulerMode, PageTab, PageTabs() (+1 more)

### Community 125 - "eslint.config.mjs"
Cohesion: 0.33
Nodes (5): eslintConfig, eslint@^9, eslint-config-next@16.3.5, eslint, eslint-config-next

### Community 126 - "request-change-modal.tsx"
Cohesion: 0.33
Nodes (7): Kind, REASON_MAX, REASON_MIN, REQUEST_KINDS, SubjectRequestDetails, SubjectRequestInput, subjectRequestSchema

### Community 127 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@7.10.0, @prisma/engines@7.10.0, unrs-resolver@1.12.2

### Community 128 - "Permission Matrix"
Cohesion: 0.50
Nodes (3): Administrator emergency exception, Permission Matrix, Registrar scheduling controls

### Community 129 - "narrative.ts"
Cohesion: 0.43
Nodes (5): getGeminiClient(), SCHEDULING_MODEL, narrate(), @google/genai@^2.23.0, @google/genai

### Community 130 - "next-auth"
Cohesion: 0.29
Nodes (6): next-auth, @auth/core/jwt, JWT, next-auth, Session, User

### Community 131 - "(dashboard)/notifications/page.tsx"
Cohesion: 0.47
Nodes (4): metadata, NotificationsPage(), notificationVisibility(), PRIVATE_APPROVAL_AUDIT

### Community 132 - "progress.tsx"
Cohesion: 0.47
Nodes (3): Progress(), ProgressIndicator(), ProgressTrack()

## Knowledge Gaps
- **1 isolated node(s):** `RFC-6238`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 957 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `next` to `actions/auth.ts`, `DialogContent`, `scheduler-workspace.tsx`, `proposals.tsx`, `StatusPage`, `report-table.tsx`, `Badge`, `overview.tsx`, `dependencies`, `prisma.ts`, `policy.ts`, `bookings/actions.ts`, `adjustment-workspace.tsx`, `theme-provider.tsx`, `levels.ts`, `(dashboard)/subjects/page.tsx`, `scheduler-workspace.tsx`, `zod`, `Input`, `requests-table.tsx`, `FieldGroup`, `shortcuts.tsx`, `users/actions.ts`, `levelLabel`, `sections.tsx`, `nav-config.ts`, `Card`, `scheduler/actions.ts`, `Button`, `search-form.tsx`, `proposals/actions.ts`, `calendar-board.tsx`, `office-dashboards.tsx`, `actions/archive.ts`, `resolve-actions.ts`, `(dashboard)/calendar/page.tsx`, `use-scheduler-filters.ts`, `avatar/route.ts`, `solver.ts`, `AvatarDialog`, `availability-form.tsx`, `timetables/actions.ts`, `building-dialogs.tsx`, `EmptyState`, `package.json`, `auth.ts`, `requireScope`, `termLabel`, `role-dashboards.tsx`, `constraints/manager.tsx`, `terms-manager.tsx`, `routes.ts`, `topbar.tsx`, `Field`, `requireRole`, `next`, `states.tsx`, `exam-workspace.tsx`, `ProposalCard`, `card.tsx`, `curriculum-list.tsx`, `breadcrumbs.tsx`, `auto-generate-dialog.tsx`, `notifications-list.tsx`, `LegalPage`, `proposals/page.tsx`?**
  _High betweenness centrality (0.095) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `requireScope()` (e.g. with `14. Gaps and Recommendations` and `4. Backend`) actually correct?**
  _`requireScope()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-6238` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `specs.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1111111111111111 - nodes in this community are weakly interconnected._
- **Why does `Button()` connect `Button` to `specs.ts`, `portal.ts`, `actions/auth.ts`, `DialogContent`, `scheduler-workspace.tsx`, `proposals.tsx`, `StatusPage`, `report-table.tsx`, `Badge`, `policy.ts`, `bookings/actions.ts`, `adjustment-workspace.tsx`, `scheduler-workspace.tsx`, `export-buttons.tsx`, `Input`, `requests-table.tsx`, `FieldGroup`, `nav-config.ts`, `Card`, `scheduler/actions.ts`, `search-form.tsx`, `proposals/actions.ts`, `calendar-board.tsx`, `class-dialog.tsx`, `resolve-actions.ts`, `AvatarDialog`, `booking-drawer.tsx`, `availability-form.tsx`, `subject-plan.test.ts`, `timetables/actions.ts`, `building-dialogs.tsx`, `assistant/actions.ts`, `EmptyState`, `termLabel`, `request-form-modal.tsx`, `constraints/manager.tsx`, `terms-manager.tsx`, `student/timetable.tsx`, `Field`, `next`, `toast.tsx`, `states.tsx`, `exam-workspace.tsx`, `ProposalCard`, `card.tsx`, `curriculum-list.tsx`, `users/manager.tsx`, `auto-generate-dialog.tsx`, `notifications-list.tsx`, `ResolveIssues`, `request-change-modal.tsx`?**
  _High betweenness centrality (0.086) - this node is a cross-community bridge._
- **Should `portal.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.12605042016806722 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Button` to `specs.ts`, `portal.ts`, `actions/auth.ts`, `DialogContent`, `scheduler-workspace.tsx`, `proposals.tsx`, `report-table.tsx`, `Badge`, `overview.tsx`, `dependencies`, `scheduler/timetable.ts`, `policy.ts`, `bookings/actions.ts`, `adjustment-workspace.tsx`, `theme-provider.tsx`, `levels.ts`, `scheduler-workspace.tsx`, `Input`, `requests-table.tsx`, `shortcuts.tsx`, `sections.tsx`, `nav-config.ts`, `Card`, `search-form.tsx`, `proposals/actions.ts`, `calendar-board.tsx`, `office-dashboards.tsx`, `class-dialog.tsx`, `resolve-actions.ts`, `use-scheduler-filters.ts`, `solver.ts`, `AvatarDialog`, `booking-drawer.tsx`, `availability-form.tsx`, `subject-plan.test.ts`, `building-dialogs.tsx`, `EmptyState`, `package.json`, `requireScope`, `termLabel`, `role-dashboards.tsx`, `request-form-modal.tsx`, `constraints/manager.tsx`, `terms-manager.tsx`, `student/timetable.tsx`, `topbar.tsx`, `Field`, `next`, `next`, `chart.tsx`, `toast.tsx`, `UserAvatar`, `states.tsx`, `exam-workspace.tsx`, `ProposalCard`, `card.tsx`, `curriculum-list.tsx`, `breadcrumbs.tsx`, `users/manager.tsx`, `auto-generate-dialog.tsx`, `notifications-list.tsx`, `tabs.tsx`, `ResolveIssues`, `request-change-modal.tsx`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._