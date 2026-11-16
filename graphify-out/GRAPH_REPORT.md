# Graph Report - scheduling  (2026-11-17)

## Corpus Check
- 808 files · ~540,973 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 163 file(s) not represented in the graph (top: (none) 141, .log 9, .db 2)

## Summary
- 4687 nodes · 18584 edges · 140 communities (134 shown, 6 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 296 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `fefa419e`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- formatRange
- profile/actions.ts
- vitest
- Button
- departments/manager.tsx
- Field
- constraints.ts
- StatusPage
- engine.ts
- devDependencies
- Badge
- assistant-data.ts
- dependencies
- AuthShell
- audit-workspace.tsx
- report-table.tsx
- seed.ts
- seed-departments.ts
- roomLabel
- Input
- RequestsManager
- Obsidian Bases Skill
- theme-provider.tsx
- requests/manager.tsx
- can
- PageHeader
- package.json
- scheduler-workspace.tsx
- next
- components/scheduler/types.ts
- components.json
- users/actions.ts
- requireRole
- users/manager.tsx
- resolve-actions.ts
- Data Design
- analytics/page.tsx
- compilerOptions
- Input
- role-dashboards.tsx
- suspensions/actions.ts
- department/actions.ts
- shortcuts.tsx
- actions/auth.ts
- export/report.ts
- breadcrumbs.tsx
- JSON Canvas Skill
- react
- proposal-workspace.tsx
- notifications/service.ts
- solver.ts
- scheduler-workspace.tsx
- avatar/route.ts
- class-dialog.tsx
- requests/actions.ts
- levelLabel
- notifications-list.tsx
- view.ts
- notifications/service.ts
- roles.ts
- STAFF_ROLES
- (portal)/layout.tsx
- sample-timetable.ts
- adjust.ts
- eslint.config.mjs
- booking-workspace.tsx
- coics-faculty.ts
- specs.ts
- (dashboard)/layout.tsx
- watchIdleSession
- assistant/actions.ts
- workload/actions.ts
- override-metrics.ts
- dashboard-summary.test.ts
- CLAUDE.md
- Activity Log
- auth.ts
- calendar-board.tsx
- assistant-fallback.ts
- AssistantChat
- AuthShell
- 2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler)
- 2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements)
- formatRange
- 2026-10-31 Login and dashboard redesign (UI only)
- Q: what process do i need to view the unschedule
- chart.tsx
- toast.tsx
- class-save.ts
- Manual QA checklist — Scheduler & Academic Management refactor
- Obsidian CLI
- timetable/config.ts
- README.md
- requireScope
- optimizer.ts
- @phosphor-icons/react
- assignment-actions.ts
- portal.ts
- Knap
- This is NOT the Next.js you know
- queueWorkloadCheck
- building-banner.tsx
- postcss.config.mjs
- (dashboard)/subjects/page.tsx
- scripts
- sections/actions.ts
- prisma.ts
- Defuddle
- formatTime
- workload-offerings.test.ts
- office-dashboards.tsx
- LegalPage
- landing.tsx
- generation.ts
- allowScripts
- timetables/[id]/page.tsx
- curriculum-list.tsx
- requireRole
- dotenv
- System Overview
- 2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5)
- 2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities
- auto.ts
- Q: Why are subjects not multiplied per section, and what is the recommended design?
- 2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user)
- Properties (Frontmatter) Reference
- 2026-10-30 Scheduler improvements, Phase 2
- replace-computing-curriculum.ts
- replace-room-catalog.ts
- workload-proposals-render.test.ts
- Permission Matrix
- Q: The auto-schedule doesnt work, the data assign doesnt connect to unschedule. What is the strongest recommendation?
- student/activity-calendar.tsx
- policy.ts
- Professor assignments from the official schedule
- levels.ts

## God Nodes (most connected - your core abstractions)
1. `Button()` - 280 edges
2. `react` - 187 edges
3. `@phosphor-icons/react` - 177 edges
4. `requireScope()` - 176 edges
5. `next` - 176 edges
6. `Badge()` - 153 edges
7. `prisma` - 134 edges
8. `formatRange()` - 129 edges
9. `vitest` - 123 edges
10. `NativeSelect()` - 111 edges

## Surprising Connections (you probably didn't know these)
- `2026-11-16 - Department Management redesign` --references--> `deleteDepartmentAction()`  [INFERRED]
  docs/activity-log.md → app/(dashboard)/admin/departments/actions.ts
- `Timetable` --references--> `n()`  [INFERRED]
  docs/QA-CHECKLIST.md → app/(dashboard)/constraints/categories.ts
- `Design notes` --references--> `RoomsExplorer()`  [INFERRED]
  docs/activity-log.md → app/(dashboard)/rooms/rooms-explorer.tsx
- `2026-11-13 - Academic level separation (phase 2)` --references--> `LevelTabs()`  [INFERRED]
  docs/activity-log.md → components/academics/level-tabs.tsx
- `2026-11-13 - Academic level tabs and strict level separation (phase 1)` --references--> `CollectionView()`  [INFERRED]
  docs/activity-log.md → components/ux/collection-view.tsx

## Import Cycles
- None detected.

## Communities (140 total, 6 thin omitted)

### Community 0 - "formatRange"
Cohesion: 0.04
Nodes (119): respond(), bookRoomAction(), bookSchema, cancelBookingAction(), Caps, date, editBookingAction(), findRoomsAction() (+111 more)

### Community 1 - "profile/actions.ts"
Cohesion: 0.07
Nodes (47): audit(), changePasswordAction(), confirmTwoFactorAction(), disableTwoFactorAction(), issueRecoveryCodes(), regenerateRecoveryCodesAction(), Result, revokeSessionAction() (+39 more)

### Community 2 - "vitest"
Cohesion: 0.09
Nodes (27): SubjectFormDialog(), termLabel(), filterSubjectSemester(), selectedSubjectSemester(), SubjectCalendar, SubjectSemester, subjectSemesterError(), subjectSemesterOptions() (+19 more)

### Community 3 - "Button"
Cohesion: 0.07
Nodes (84): Decision, DecisionPanel(), BulkAccounts(), removeProgramAssignmentAction(), ProgramAssignments(), remove(), AssignmentApprovalsWorkspace(), dateLabel() (+76 more)

### Community 4 - "departments/manager.tsx"
Cohesion: 0.07
Nodes (40): assignDepartmentHeadAction(), deleteDepartmentAction(), departmentSchema, refreshDepartments(), removeDepartmentHeadAssignmentAction(), Result, saveDepartmentAction(), Department (+32 more)

### Community 5 - "Field"
Cohesion: 0.08
Nodes (40): setOwnPasswordAction(), SetPasswordForm(), ADMIN, bookingSchema, schema, setRequireApprovalAction(), time, updateBookingSettingsAction() (+32 more)

### Community 6 - "constraints.ts"
Cohesion: 0.04
Nodes (70): AutoScheduleRoom, roomAllowsSection(), RoomDesignation, SCHOOL_LEVELS, SectionDesignation, deliveryPolicySchema, ConflictContext, detectConflicts() (+62 more)

### Community 7 - "StatusPage"
Cohesion: 0.33
Nodes (6): ForbiddenPage(), metadata, Forbidden(), metadata, Unauthorized(), StatusPage()

### Community 8 - "engine.ts"
Cohesion: 0.10
Nodes (35): BookingMeta, PlanSnapshot, blocked(), candidates(), Clash, ClashReason, DatedAdjustment, facultyCanTeach() (+27 more)

### Community 9 - "devDependencies"
Cohesion: 0.09
Nodes (23): devDependencies, dotenv@^17.4.2, tailwindcss@^4, @tailwindcss/postcss@^4, tsx@^4.23.13, @types/node@^20, @types/nodemailer@^8.0.2, @types/pg@^8.23.1 (+15 more)

### Community 10 - "Badge"
Cohesion: 0.11
Nodes (46): bulkReviewAction(), refresh(), ReviewInbox(), decide(), ReviewKind, ReviewTab, ReviewQueueTabs(), AnalyticsCharts() (+38 more)

### Community 11 - "assistant-data.ts"
Cohesion: 0.10
Nodes (24): availabilityAction(), 2026-11-13 - Unpublished timetables hidden from faculty and students, availabilitySchema, createAssistantData(), execute(), source(), dateSchema, DAYS (+16 more)

### Community 12 - "dependencies"
Cohesion: 0.06
Nodes (31): dependencies, @auth/prisma-adapter@^2.11.3, @base-ui/react@^1.8.0, bcryptjs@^3.0.3, class-variance-authority@^0.7.1, cmdk@^1.1.1, cn@^0.3.0, @dnd-kit/core@^6.3.1 (+23 more)

### Community 13 - "AuthShell"
Cohesion: 0.12
Nodes (21): requiresAdminApproval(), dynamic, GET(), body, POST(), LoginPage(), metadata, NOTICES (+13 more)

### Community 14 - "audit-workspace.tsx"
Cohesion: 0.10
Nodes (40): AuditWorkspace(), timestamp(), valueText(), AuditLogsPage(), metadata, archiveDate(), ArchivedList(), restore() (+32 more)

### Community 15 - "report-table.tsx"
Cohesion: 0.10
Nodes (22): AFFECT_COLOR, AFFECT_LABEL, affectText(), FilterSelect(), formatTime(), Option, ReportRow, Row (+14 more)

### Community 16 - "seed.ts"
Cohesion: 0.12
Nodes (22): BASIC_EDUCATION_DEPARTMENTS, clearSchedules(), db, addBookingSamples(), JS_DAYS, addSampleHistory(), ensureUnderloadedAccount(), random() (+14 more)

### Community 17 - "seed-departments.ts"
Cohesion: 0.07
Nodes (30): CBA_SUBJECTS, CCJE_SUBJECTS, CHTM_SUBJECTS, CTE_SUBJECTS, DEPARTMENT_PLANS, DeptPlan, DeptSection, DeptSubject (+22 more)

### Community 18 - "roomLabel"
Cohesion: 0.07
Nodes (48): BatchView, ReportView, AdjustmentsPage(), CAUSE_LABELS, metadata, CalendarTab, CalendarTabs(), CalendarPage() (+40 more)

### Community 19 - "Input"
Cohesion: 0.07
Nodes (70): AdjustmentWorkspace(), apply(), today(), ViewAsPage(), Option, TABLES, Totals, saveAvailableDaysAction() (+62 more)

### Community 20 - "RequestsManager"
Cohesion: 0.24
Nodes (24): BookingsList(), classes(), COLUMNS, Tab, RequestsManager(), IdleSession(), SignOutConfirmation(), SessionList() (+16 more)

### Community 21 - "Obsidian Bases Skill"
Cohesion: 0.04
Nodes (44): Any Type Functions, Date Arithmetic, Date Functions & Fields, Duration Type, File Functions, Functions Reference, Global Functions, Link Functions (+36 more)

### Community 22 - "theme-provider.tsx"
Cohesion: 0.15
Nodes (20): geistMono, inter, jakarta, metadata, RootLayout(), Providers(), toggleTheme(), Toaster() (+12 more)

### Community 23 - "requests/manager.tsx"
Cohesion: 0.05
Nodes (70): metadata, ProfilePage(), SECTIONS, PAGE_SIZES, sortValue(), Compare(), DOT, fields (+62 more)

### Community 24 - "can"
Cohesion: 0.14
Nodes (27): reorderAction(), FacultyPage(), metadata, deleteProgramAction(), renameDepartmentAction(), renameSchema, Result, revalidate() (+19 more)

### Community 25 - "PageHeader"
Cohesion: 0.14
Nodes (16): ArchivedPage(), metadata, metadata, UsersPage(), UserTabs(), metadata, AvailabilityPage(), ImportPage() (+8 more)

### Community 26 - "package.json"
Cohesion: 0.09
Nodes (21): clsx@^2.1.1, date-fns@^4.4.0, @dnd-kit/utilities@^3.2.2, @google/genai@^2.23.0, nodemailer@^8.0.11, prisma@7.10.0, qrcode@^1.5.4, shadcn@^4.21.0 (+13 more)

### Community 27 - "scheduler-workspace.tsx"
Cohesion: 0.04
Nodes (99): TIMES, ExamInput, moveExamAction(), ConfiguredTimeInput(), gridKeyboardCoordinatesFor(), addDays(), classKey(), ClassRef (+91 more)

### Community 28 - "next"
Cohesion: 0.06
Nodes (72): Program, Target, Term, FIELDS, fmt(), Year, YearsManager(), STATUS (+64 more)

### Community 29 - "components/scheduler/types.ts"
Cohesion: 0.17
Nodes (18): SectionOption, ACTIVE_TERMS, DEPENDENTS, Filters, KEYS, sectionMatches(), useSchedulerFilters(), YEAR_LEVELS (+10 more)

### Community 30 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 31 - "users/actions.ts"
Cohesion: 0.11
Nodes (32): ADMIN, BulkAccountResult, BulkAccountRow, createFacultyAccountsBulkAction(), createSchema, FacultyAccountError, generatePassword(), gmailSchema (+24 more)

### Community 32 - "requireRole"
Cohesion: 0.12
Nodes (33): activateTerm(), createDefaultTermsAction(), deleteAcademicYearAction(), deleteTermAction(), Result, revalidate(), saveAcademicYearAction(), saveTermAction() (+25 more)

### Community 33 - "users/manager.tsx"
Cohesion: 0.08
Nodes (40): approveUserAction(), changeEmailAction(), createFacultyAccountAction(), removeUserAvatarAction(), resetPasswordAction(), setAccountStatusAction(), setDepartment(), updateUserAction() (+32 more)

### Community 34 - "resolve-actions.ts"
Cohesion: 0.05
Nodes (90): applyAutoScheduleAction(), ids, previewAutoScheduleAction(), applyRepairAction(), applySchema, changeSchema, DAY, entrySchema (+82 more)

### Community 35 - "Data Design"
Cohesion: 0.06
Nodes (32): Data Design, SubjectAssignmentProposal, Supporting tables not detailed above, Table 10. FacultyAvailability, Table 11. Student, Table 12. Building, Table 13. Floor, Table 14. Room (+24 more)

### Community 36 - "analytics/page.tsx"
Cohesion: 0.14
Nodes (31): AnalyticsPage(), metadata, OverrideReport(), AdminPanels(), Card, dashboardAnalytics(), DashboardFilters, pctText() (+23 more)

### Community 37 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 38 - "Input"
Cohesion: 0.08
Nodes (55): categoryOf(), ConstraintRow, CreateCategory, createCategoryOf(), CATEGORY_ICONS, ConstraintDialog(), choose(), Option (+47 more)

### Community 39 - "role-dashboards.tsx"
Cohesion: 0.14
Nodes (23): DashboardPage(), LANDING, metadata, metadata, WorkloadPage(), getActiveTerms, KpiSkeleton(), SectionSkeleton() (+15 more)

### Community 40 - "suspensions/actions.ts"
Cohesion: 0.07
Nodes (41): metadata, ReportsPage(), applySuspensionAction(), ContinuityError, DATE, fingerprint(), liftSuspensionAction(), notifyStudents() (+33 more)

### Community 41 - "department/actions.ts"
Cohesion: 0.15
Nodes (18): GET(), Result, saveDepartmentProfileAction(), save(), DEPARTMENT_LOGO_MAX_BYTES, DEPARTMENT_LOGO_TYPES, DepartmentProfile, departmentProfileSchema (+10 more)

### Community 42 - "shortcuts.tsx"
Cohesion: 0.14
Nodes (15): GlobalSearch(), handleKeyDown(), handleSelect(), GROUP_ICONS, Kbd(), Ctx, isTypingTarget(), NAV_SHORTCUTS (+7 more)

### Community 43 - "actions/auth.ts"
Cohesion: 0.11
Nodes (37): ActionResult, Audience, fieldErrors(), findUserByEmail(), forgotPasswordAction(), ip(), matchesAudience(), registerAction() (+29 more)

### Community 44 - "export/report.ts"
Cohesion: 0.12
Nodes (25): exportRows(), ActivitiesReportButtons(), ExportButtons(), ReportButtons(), RoomAssignmentRow, RoomAssignmentsReportButtons(), withoutQuarterTerms(), cell() (+17 more)

### Community 45 - "breadcrumbs.tsx"
Cohesion: 0.28
Nodes (8): BreadcrumbItem, buildBreadcrumbs(), CONTEXTUAL, LEVEL_LABELS, PAGE_LABELS, pageLabel(), parentTrail(), QUEUE_LABELS

### Community 46 - "JSON Canvas Skill"
Cohesion: 0.08
Nodes (26): Flowchart, JSON Canvas Complete Examples, Project Board with Groups, Research Canvas with Files and Links, Simple Canvas with Text and Connections, 1. Create a New Canvas, 2. Add a Node to an Existing Canvas, 3. Connect Two Nodes (+18 more)

### Community 47 - "react"
Cohesion: 0.08
Nodes (25): STEPS, View, MOBILE_LABELS, Avatar(), AvatarFallback(), AvatarImage(), buttonVariants, Calendar() (+17 more)

### Community 48 - "proposal-workspace.tsx"
Cohesion: 0.10
Nodes (33): day(), Input, previewProposalAction(), proposalSchema, refresh(), Result, rowSchema, saveProposalDraftAction() (+25 more)

### Community 49 - "notifications/service.ts"
Cohesion: 0.25
Nodes (13): GET(), listRecentNotificationsAction(), markAllNotificationsReadAction(), markNotificationReadAction(), metadata, NotificationsPage(), requireAccount(), notificationSummary() (+5 more)

### Community 50 - "solver.ts"
Cohesion: 0.15
Nodes (39): deliveryPolicy(), splitPolicyMinutes(), unresolved(), countIssues(), detectIssues(), live(), plotted(), progress() (+31 more)

### Community 51 - "scheduler-workspace.tsx"
Cohesion: 0.05
Nodes (70): DAYS, GridEntry, WeekGrid(), collision(), gridKeyboardCoordinates, RowInfo, ActiveDrag, PanelKey (+62 more)

### Community 52 - "avatar/route.ts"
Cohesion: 0.17
Nodes (20): GET(), ACTIONS, DELETE(), guard(), POST(), record(), currentSession, getSession() (+12 more)

### Community 53 - "class-dialog.tsx"
Cohesion: 0.09
Nodes (30): ClassInput, ClassDialog(), ClassDraft, ClassForm(), describeOther(), hours(), LENGTH_CHIPS, STATUS_OPTIONS (+22 more)

### Community 54 - "requests/actions.ts"
Cohesion: 0.07
Nodes (47): activitySchema, DECISION_TEXT, deleteActivityAction(), Result, revalidate(), reviewActivitiesAction(), reviewSchema, saveActivityAction() (+39 more)

### Community 55 - "levelLabel"
Cohesion: 0.08
Nodes (55): LEVEL_OPTIONS, previewConstraintAction(), availableDays(), CATEGORIES, Category, CREATE_CATEGORIES, DEFAULT_PARAMS, n() (+47 more)

### Community 56 - "notifications-list.tsx"
Cohesion: 0.24
Nodes (16): FacultyPopover(), groupByFaculty(), sectionsOf(), SubjectsToolbar(), AssignmentRow, AssistantWidget(), NotificationsMenu(), FilterCard() (+8 more)

### Community 57 - "view.ts"
Cohesion: 0.17
Nodes (22): approveRow(), awaitingLabel(), canApprove(), canEdit(), canReject(), isCrossDepartment(), isOpen(), proposalOutcome() (+14 more)

### Community 58 - "notifications/service.ts"
Cohesion: 0.21
Nodes (15): NotificationsList(), NotificationEmpty(), NotificationFeed(), NotificationSkeleton(), fetchNotifications(), useNotificationActions(), groupNotifications(), NotificationItem (+7 more)

### Community 59 - "roles.ts"
Cohesion: 0.15
Nodes (13): GET(), isPublicPath(), SUGGESTIONS, HOME_PATH, ROLES, ROOM_BOOKING_ROLES, STUDENT_HOME_PATH, SUPER_ROLES (+5 more)

### Community 60 - "STAFF_ROLES"
Cohesion: 0.17
Nodes (13): allOwned(), PATHS, schema, DepartmentProfilePage(), metadata, ProfileSection(), canManageSection(), canViewSection() (+5 more)

### Community 61 - "(portal)/layout.tsx"
Cohesion: 0.42
Nodes (7): StudentPortalLayout(), switchView(), ViewAsBanner(), ViewAsButton(), StudentNavigation(), requireStudent(), publishDueSubmissions()

### Community 62 - "sample-timetable.ts"
Cohesion: 0.25
Nodes (7): Busy, DAY_PATTERNS, OVERLOAD_EXTRAS, SectionPlan, SINGLE_DAYS, START_TIMES, TEACHER_FOR

### Community 63 - "adjust.ts"
Cohesion: 0.06
Nodes (56): AdjustmentRequest, applyAdjustmentAction(), authorize(), base, batchEnd(), batchScope(), checked(), choiceSchema (+48 more)

### Community 64 - "eslint.config.mjs"
Cohesion: 0.33
Nodes (5): eslintConfig, eslint@^9, eslint-config-next@16.3.5, eslint, eslint-config-next

### Community 65 - "booking-workspace.tsx"
Cohesion: 0.19
Nodes (10): Loading(), Loading(), Loading(), Loading(), Loading(), Loading(), SchedulerLoading(), Loading() (+2 more)

### Community 66 - "coics-faculty.ts"
Cohesion: 0.15
Nodes (16): EMPLOYEE_ID_PREFIX, employeeIdSchema, accounts(), COICS_DESIGNATED_HEAD, Db, ExistingFaculty, planCoicsFaculty(), previewCoicsFaculty() (+8 more)

### Community 67 - "specs.ts"
Cohesion: 0.16
Nodes (19): levelForGrade(), COLUMNS, GRADES, ImportColumn, ImportKind, LEVELS, norm(), num() (+11 more)

### Community 68 - "(dashboard)/layout.tsx"
Cohesion: 0.12
Nodes (33): DashboardLayout(), MobileNav(), SHORT_LABELS, activeHrefFor(), ADMIN, allowedHrefsForRole(), collapse(), filterNavForRole() (+25 more)

### Community 69 - "watchIdleSession"
Cohesion: 0.20
Nodes (14): ACTIVITY_EVENTS, IdleSessionState, StoredActivity, watchIdleSession(), activity(), check(), expire(), publish() (+6 more)

### Community 70 - "assistant/actions.ts"
Cohesion: 0.12
Nodes (28): ChatMessage, getAssistantHistory(), latestConversation(), messageSchema, sendAssistantMessageAction(), toChatMessage(), assistantPage(), assistantPageSchema (+20 more)

### Community 71 - "workload/actions.ts"
Cohesion: 0.14
Nodes (26): approveProposalAction(), editProposalRowAction(), recheckWorkloadAction(), rejectProposalAction(), Result, revalidate(), review(), ReviewData (+18 more)

### Community 73 - "override-metrics.ts"
Cohesion: 0.17
Nodes (15): dateLabel(), OverrideReportView(), Pagination(), usePagination(), hasResponse(), OVERRIDE_RESPONSE_LABELS, OverrideEntry, overrideMetrics() (+7 more)

### Community 74 - "dashboard-summary.test.ts"
Cohesion: 0.43
Nodes (6): headLanding(), Component, latestTimetables(), sectionReadiness(), teachingDay(), TeachingSession

### Community 75 - "CLAUDE.md"
Cohesion: 0.17
Nodes (10): Academic Levels, AI Restrictions, Code Quality, Core Features, Design and Technical Requirements, General Principles, Light Text Rule (Strict), Naming Rules (+2 more)

### Community 76 - "Activity Log"
Cohesion: 0.04
Nodes (45): 2026-10-14 - Role dashboards (commit 752bf31), 2026-10-31 Mobile and tablet pass (code review, no browser), 2026-10-31 Room Booking redesign (UI only), 2026-10-31 Scheduler: Resolve issues, 2026-10-31 Scheduling Constraints redesign (UI only), 2026-10-31 Speed pass, 2026-11-01 Subject Assigning, 2026-11-03 Audit Logs limited to the Administrator (+37 more)

### Community 78 - "auth.ts"
Cohesion: 0.11
Nodes (17): GET, POST, authConfig, PUBLIC_PATHS, credentialsSchema, handlers, signIn, signOut (+9 more)

### Community 79 - "calendar-board.tsx"
Cohesion: 0.07
Nodes (60): ActivityInput, ActivitiesTable(), dateText(), monthOf(), scopeText(), timeText(), typeLabel(), TYPES (+52 more)

### Community 80 - "assistant-fallback.ts"
Cohesion: 0.36
Nodes (8): Data, fallbackReply(), format(), line(), manilaDate(), nowMin(), parseTime(), Row

### Community 81 - "AssistantChat"
Cohesion: 0.40
Nodes (6): clearAssistantHistoryAction(), AssistantChat(), clear(), send(), renderBold(), suggestions()

### Community 82 - "AuthShell"
Cohesion: 0.12
Nodes (24): resetPasswordAction(), verifyEmailToken(), ChangePasswordPage(), metadata, ForgotPasswordPage(), metadata, metadata, ResetPasswordPage() (+16 more)

### Community 83 - "2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler)"
Cohesion: 0.33
Nodes (6): 2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler), Decisions (confirmed with the user), Design notes, Gotchas, Progress (all done, 11 commits 773d893..6e2b15b), Verification

### Community 84 - "2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements)"
Cohesion: 0.40
Nodes (5): 2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements), Changes, Decisions (user), Findings, Gotchas

### Community 86 - "formatRange"
Cohesion: 0.21
Nodes (17): MovedTag(), DayAgenda(), isWide(), ListView(), mergeRuns(), options(), ComponentTag(), shortDay() (+9 more)

### Community 88 - "2026-10-31 Login and dashboard redesign (UI only)"
Cohesion: 0.40
Nodes (5): 2026-10-31 Login and dashboard redesign (UI only), App shell, Dashboard, Gotchas, Login

### Community 89 - "Q: what process do i need to view the unschedule"
Cohesion: 0.50
Nodes (3): Answer, Q: what process do i need to view the unschedule, Source Nodes

### Community 90 - "chart.tsx"
Cohesion: 0.22
Nodes (12): ChartConfig, ChartContainer(), ChartContext, ChartContextProps, ChartLegendContent(), ChartStyle(), ChartTooltipContent(), getPayloadConfigFromPayload() (+4 more)

### Community 91 - "toast.tsx"
Cohesion: 0.26
Nodes (13): toast, Toast(), ToastAction(), ToastClose(), ToastContent(), ToastDescription(), Toaster(), ToastIcon() (+5 more)

### Community 92 - "class-save.ts"
Cohesion: 0.11
Nodes (31): DIRECT_EDIT_ROLES, applyCrossDepartment(), matchingPolicies(), bookingClash(), checkClass(), createQueuedClass(), enforceConstraints(), QueuePlacementChanged (+23 more)

### Community 93 - "Manual QA checklist — Scheduler & Academic Management refactor"
Cohesion: 0.13
Nodes (14): 1. Drag and drop, 2. Keyboard, 3. Conflict detection, 4. Academic setup, 5. Removed features, 6. States & accessibility, Global, Manual QA checklist — Scheduler & Academic Management refactor (+6 more)

### Community 94 - "Obsidian CLI"
Cohesion: 0.20
Nodes (9): Additional developer commands, Command reference, Common patterns, Develop/test cycle, File targeting, Obsidian CLI, Plugin development, Syntax (+1 more)

### Community 95 - "timetable/config.ts"
Cohesion: 0.13
Nodes (26): previewTimetableConfigurationAction(), saveTimetableConfigurationAction(), check(), save(), TimetableBundle, timetableScopeKey(), bundleFrom(), changeSchema (+18 more)

### Community 97 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 98 - "requireScope"
Cohesion: 0.09
Nodes (38): allowed(), ConstraintInput, deleteConstraintAction(), Result, revalidate(), saveConstraintAction(), schema, toggleConstraintAction() (+30 more)

### Community 99 - "optimizer.ts"
Cohesion: 0.16
Nodes (27): 2026-11-01 Always-balanced workload with Head of Department approval, amountOf(), basisOf(), describeMove(), explain(), isFree(), loadReport(), LoadStatus (+19 more)

### Community 100 - "@phosphor-icons/react"
Cohesion: 0.04
Nodes (67): FormState, Kind, KINDS, Option, TIMES, UndoButton(), addDays(), AvailabilityGrid() (+59 more)

### Community 101 - "assignment-actions.ts"
Cohesion: 0.05
Nodes (62): AssignmentApprovalsSection(), submitDecision(), AssignmentProposalRow, AssignmentApprovalsPage(), metadata, save(), assignmentConflictsAction(), checkSchema (+54 more)

### Community 102 - "portal.ts"
Cohesion: 0.17
Nodes (19): metadata, StudentCalendarPage(), metadata, StudentDashboardPage(), metadata, StudentProfilePage(), metadata, StudentSchedulePage() (+11 more)

### Community 103 - "Knap"
Cohesion: 0.33
Nodes (5): Batch rendering, Defuddle pipeline, Knap, Templates, Usage

### Community 106 - "queueWorkloadCheck"
Cohesion: 0.08
Nodes (40): allowed(), archiveRecordAction(), ArchiveResult, departmentOf(), PATHS, REFUSED, restoreRecordAction(), schema (+32 more)

### Community 108 - "building-banner.tsx"
Cohesion: 0.20
Nodes (19): BuildingDetails, BuildingDialog(), choose(), resize(), BuildingBanner(), BuildingsOverview(), BuildingSummary, RoomReportRow (+11 more)

### Community 111 - "(dashboard)/subjects/page.tsx"
Cohesion: 0.10
Nodes (34): metadata, ProgramsPage(), metadata, SectionsPage(), SectionTermFilters(), metadata, SubjectsPage(), SubjectSemesterFilter() (+26 more)

### Community 112 - "scripts"
Cohesion: 0.17
Nodes (12): scripts, audit:owners, build, check, dev, lint, postinstall, seed:departments (+4 more)

### Community 113 - "sections/actions.ts"
Cohesion: 0.08
Nodes (34): generateSectionsAction(), loadSectionCurriculumAction(), loadSectionGenerationContextAction(), Result, schema, undoSectionGenerationAction(), submit(), undo() (+26 more)

### Community 114 - "prisma.ts"
Cohesion: 0.05
Nodes (62): metadata, SettingsPage(), metadata, metadata, BuildingPage(), metadata, RoomsPage(), day() (+54 more)

### Community 115 - "Defuddle"
Cohesion: 0.50
Nodes (3): Defuddle, Output formats, Usage

### Community 116 - "formatTime"
Cohesion: 0.07
Nodes (48): ChangeList(), classSheets(), examConflicts(), fmt(), metadata, SnapshotTable(), TimetableReviewPage(), CommentBox() (+40 more)

### Community 117 - "workload-offerings.test.ts"
Cohesion: 0.15
Nodes (15): assignmentLoad(), DepartmentInput, DepartmentStaffingRow, FacultyInput, round1(), summarizeDepartmentStaffing(), WorkloadMeasure, Assignment (+7 more)

### Community 120 - "office-dashboards.tsx"
Cohesion: 0.10
Nodes (43): ClassFocus(), dashboardLink, DashboardOverview(), ICON_TONES, LandingMetric, LandingMetrics(), METRIC_ICONS, AdministratorDashboard() (+35 more)

### Community 121 - "LegalPage"
Cohesion: 0.39
Nodes (5): metadata, PrivacyPage(), metadata, TermsPage(), LegalPage()

### Community 122 - "landing.tsx"
Cohesion: 0.13
Nodes (30): StatGrid(), ActivityTypeBadge(), STYLES, StudentLanding(), line(), MovedList(), NoticeBanner(), read() (+22 more)

### Community 124 - "generation.ts"
Cohesion: 0.33
Nodes (10): distributeLearners(), ExistingGenerationSection, generateSectionNames(), GenerationPreviewRow, nextSectionIndex(), planSectionGeneration(), SectionGenerationContext, sectionSuffix() (+2 more)

### Community 125 - "allowScripts"
Cohesion: 0.40
Nodes (5): allowScripts, esbuild@0.28.2, prisma@7.10.0, @prisma/engines@7.10.0, unrs-resolver@1.12.2

### Community 126 - "timetables/[id]/page.tsx"
Cohesion: 0.05
Nodes (63): inputSchema, Result, fmt(), metadata, QUEUES, ReviewCenterPage(), words(), ReviewRow (+55 more)

### Community 128 - "curriculum-list.tsx"
Cohesion: 0.07
Nodes (41): exportCsv(), CATEGORY_LABEL, PAGE_SIZES, RowAction, CategoryBadge(), ColumnKey, COLUMNS, Faculty() (+33 more)

### Community 129 - "requireRole"
Cohesion: 0.17
Nodes (19): validateImportAction(), buildingSchema, deleteBuildingAction(), deleteFloorAction(), done(), floorSchema, minutes, PHOTO_TYPES (+11 more)

### Community 130 - "dotenv"
Cohesion: 0.08
Nodes (21): db, s(), dotenv, pg, @prisma/adapter-pg, aliases, confirmedUnassigned, corrections (+13 more)

### Community 133 - "System Overview"
Cohesion: 0.05
Nodes (36): Activity, archive(), 1. Route handlers, 2. Page routes and role access, 4. Response conventions and errors, 5. Not found / unclear, API Reference, Overview (+28 more)

### Community 136 - "2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5)"
Cohesion: 0.67
Nodes (3): 2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5), Gotchas, What changed

### Community 137 - "2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities"
Cohesion: 0.67
Nodes (3): 2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities, Decisions (confirmed with the user), Gotchas

### Community 138 - "auto.ts"
Cohesion: 0.13
Nodes (26): departmentStaffing(), weeklyDoubleBooking(), syncAssignmentsForMove(), activeTermIds(), applyMoves(), chain, check(), getWorkloadStatus() (+18 more)

### Community 139 - "Q: Why are subjects not multiplied per section, and what is the recommended design?"
Cohesion: 0.50
Nodes (3): Answer, Q: Why are subjects not multiplied per section, and what is the recommended design?, Source Nodes

### Community 140 - "2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user)"
Cohesion: 0.67
Nodes (3): 2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user), Decisions (confirmed with the user), Design notes

### Community 142 - "Properties (Frontmatter) Reference"
Cohesion: 0.05
Nodes (33): Basic Callout, Callouts Reference, Custom Callouts (CSS), Foldable Callouts, Nested Callouts, Supported Callout Types, Embed Audio, Embed Bases (+25 more)

### Community 143 - "2026-10-30 Scheduler improvements, Phase 2"
Cohesion: 0.67
Nodes (3): 2026-10-30 Scheduler improvements, Phase 2, Changes, Gotchas

### Community 144 - "replace-computing-curriculum.ts"
Cohesion: 0.16
Nodes (16): curriculumProgramWhere(), COMPUTING_ACADEMIC_YEAR, COMPUTING_CURRICULA, computingSubjects(), CurriculumYear, elective, firstYear, fitness (+8 more)

### Community 145 - "replace-room-catalog.ts"
Cohesion: 0.22
Nodes (14): normalize(), ownerDepartments(), previewRoomCatalog(), replaceRoomCatalog(), verifyRoomCatalog(), RoomOwner, RoomRow, SUPPLIED_ROOM_BUILDINGS (+6 more)

### Community 147 - "workload-proposals-render.test.ts"
Cohesion: 0.38
Nodes (5): ProposalRowView, row, workloadPreviewFixture, workloadProposalFixture, render()

### Community 149 - "Permission Matrix"
Cohesion: 0.40
Nodes (4): Administrator scope, Enforcement contract, Permission Matrix, Registrar scheduling controls

### Community 154 - "Q: The auto-schedule doesnt work, the data assign doesnt connect to unschedule. What is the strongest recommendation?"
Cohesion: 0.50
Nodes (3): Answer, Q: The auto-schedule doesnt work, the data assign doesnt connect to unschedule. What is the strongest recommendation?, Source Nodes

### Community 155 - "student/activity-calendar.tsx"
Cohesion: 0.16
Nodes (21): DashboardActivities(), ACTIVITY_COLORS, DashboardActivity, DashboardActivityCalendar(), navigate(), ActivityCard(), DOTS, StudentActivityCalendar() (+13 more)

### Community 156 - "policy.ts"
Cohesion: 0.05
Nodes (45): Can(), usePermission(), ScopedDropdown(), ScopedOption, 2026-10-29 - Head of Department scope, merged Scheduler (steps 1 to 3), 2026-11-07 Super Administrator and Registrar roles; new system title, Decisions (confirmed with the user), Design notes (+37 more)

### Community 158 - "Professor assignments from the official schedule"
Cohesion: 0.33
Nodes (5): Assignments by section, Newly registered faculty, Professor assignments from the official schedule, User-confirmed decisions, Verification and rerunning

### Community 161 - "levels.ts"
Cohesion: 0.12
Nodes (32): AcademicYearDetailPage(), metadata, Countable, LevelCards(), handleChange(), globalSearchAction(), SearchResult, CardGrid() (+24 more)

## Knowledge Gaps
- **1 isolated node(s):** `RFC-6238`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1370 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `react` to `curriculum-list.tsx`, `profile/actions.ts`, `vitest`, `Button`, `departments/manager.tsx`, `Field`, `Badge`, `dependencies`, `audit-workspace.tsx`, `report-table.tsx`, `Input`, `RequestsManager`, `workload-proposals-render.test.ts`, `theme-provider.tsx`, `requests/manager.tsx`, `package.json`, `student/activity-calendar.tsx`, `next`, `policy.ts`, `scheduler-workspace.tsx`, `components/scheduler/types.ts`, `requireRole`, `users/manager.tsx`, `resolve-actions.ts`, `analytics/page.tsx`, `Input`, `role-dashboards.tsx`, `shortcuts.tsx`, `actions/auth.ts`, `export/report.ts`, `proposal-workspace.tsx`, `scheduler-workspace.tsx`, `class-dialog.tsx`, `levelLabel`, `notifications-list.tsx`, `notifications/service.ts`, `(portal)/layout.tsx`, `(dashboard)/layout.tsx`, `override-metrics.ts`, `calendar-board.tsx`, `formatRange`, `chart.tsx`, `toast.tsx`, `timetable/config.ts`, `@phosphor-icons/react`, `assignment-actions.ts`, `portal.ts`, `building-banner.tsx`, `(dashboard)/subjects/page.tsx`, `prisma.ts`, `formatTime`, `office-dashboards.tsx`, `landing.tsx`?**
  _High betweenness centrality (0.090) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `requireScope()` (e.g. with `14. Gaps and Recommendations` and `4. Backend`) actually correct?**
  _`requireScope()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-6238` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `formatRange` be split into smaller, more focused modules?**
  _Cohesion score 0.03873319662793347 - nodes in this community are weakly interconnected._
- **Why does `next` connect `next` to `formatRange`, `profile/actions.ts`, `requireRole`, `Button`, `departments/manager.tsx`, `Field`, `curriculum-list.tsx`, `vitest`, `StatusPage`, `Badge`, `auto.ts`, `dependencies`, `AuthShell`, `audit-workspace.tsx`, `Input`, `RequestsManager`, `theme-provider.tsx`, `can`, `PageHeader`, `package.json`, `student/activity-calendar.tsx`, `scheduler-workspace.tsx`, `components/scheduler/types.ts`, `users/actions.ts`, `requireRole`, `levels.ts`, `users/manager.tsx`, `resolve-actions.ts`, `analytics/page.tsx`, `Input`, `role-dashboards.tsx`, `suspensions/actions.ts`, `department/actions.ts`, `shortcuts.tsx`, `actions/auth.ts`, `react`, `proposal-workspace.tsx`, `notifications/service.ts`, `scheduler-workspace.tsx`, `avatar/route.ts`, `requests/actions.ts`, `notifications-list.tsx`, `STAFF_ROLES`, `adjust.ts`, `(dashboard)/layout.tsx`, `workload/actions.ts`, `override-metrics.ts`, `auth.ts`, `calendar-board.tsx`, `AuthShell`, `formatRange`, `class-save.ts`, `timetable/config.ts`, `requireScope`, `@phosphor-icons/react`, `assignment-actions.ts`, `portal.ts`, `queueWorkloadCheck`, `building-banner.tsx`, `(dashboard)/subjects/page.tsx`, `sections/actions.ts`, `prisma.ts`, `formatTime`, `office-dashboards.tsx`, `LegalPage`, `landing.tsx`, `timetables/[id]/page.tsx`?**
  _High betweenness centrality (0.068) - this node is a cross-community bridge._
- **Should `profile/actions.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.0701344243132671 - nodes in this community are weakly interconnected._
- **Why does `Button()` connect `Button` to `curriculum-list.tsx`, `profile/actions.ts`, `departments/manager.tsx`, `Field`, `StatusPage`, `Badge`, `audit-workspace.tsx`, `report-table.tsx`, `Input`, `RequestsManager`, `requests/manager.tsx`, `student/activity-calendar.tsx`, `next`, `scheduler-workspace.tsx`, `requireRole`, `users/manager.tsx`, `resolve-actions.ts`, `Input`, `actions/auth.ts`, `export/report.ts`, `react`, `proposal-workspace.tsx`, `scheduler-workspace.tsx`, `class-dialog.tsx`, `levelLabel`, `notifications-list.tsx`, `notifications/service.ts`, `(portal)/layout.tsx`, `adjust.ts`, `workload/actions.ts`, `override-metrics.ts`, `calendar-board.tsx`, `AssistantChat`, `AuthShell`, `formatRange`, `toast.tsx`, `@phosphor-icons/react`, `building-banner.tsx`, `formatTime`, `landing.tsx`, `timetables/[id]/page.tsx`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._