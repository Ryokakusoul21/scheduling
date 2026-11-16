# Graph Report - scheduling  (2026-11-16)

## Corpus Check
- 778 files · ~446,796 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 7 file(s) not represented in the graph (top: .csv 2, (none) 1, .ico 1)

## Summary
- 4574 nodes · 18309 edges · 161 communities (156 shown, 5 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 290 edges (avg confidence: 0.92)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b61a9cb8`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- bookings/plan.ts
- profile/actions.ts
- timetable/config.ts
- Button
- constraint-dialog.tsx
- Field
- room-results.tsx
- StatusPage
- scheduler/actions.ts
- workload-board.tsx
- scheduler-workspace.tsx
- Scope
- package.json
- DashboardActivityCalendar
- view-assigned-panel.tsx
- react
- seed.ts
- shortcuts.tsx
- workload/actions.ts
- Card
- bookings/service.ts
- Obsidian Bases Skill
- theme-provider.tsx
- requests/manager.tsx
- lib/scheduler/types.ts
- report-table.tsx
- resolve-actions.ts
- formatRange
- Badge
- components/scheduler/types.ts
- components.json
- users/actions.ts
- roles.ts
- scheduler/auto-schedule.ts
- solver.ts
- Data Design
- analytics-charts.tsx
- compilerOptions
- export/report.ts
- resolve-issues.tsx
- suspensions/actions.ts
- department/actions.ts
- lib/calendar.ts
- subjects/actions.ts
- NativeSelect
- [buildingId]/page.tsx
- JSON Canvas Skill
- AvatarDialog
- proposal-workspace.tsx
- @phosphor-icons/react
- policy-admin.ts
- package.json
- programs/page.tsx
- requireScope
- breadcrumbs.tsx
- states.tsx
- notifications-list.tsx
- requests/actions.ts
- notifications/service.ts
- command.tsx
- BookingWorkspace
- formatRange
- levelLabel
- routes.ts
- Obsidian Flavored Markdown Skill
- booking-workspace.tsx
- AuthShell
- specs.ts
- (dashboard)/layout.tsx
- watchIdleSession
- assistant/actions.ts
- topbar.tsx
- overview.tsx
- UserAvatar
- timetables/[id]/page.tsx
- CLAUDE.md
- Activity Log
- session-list.tsx
- examinations/auto-schedule.ts
- calendar-board.tsx
- side-panels.tsx
- templates.ts
- AuthShell
- 2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler)
- 2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements)
- zod
- formatRange
- dashboard-summary.test.ts
- 2026-10-31 Login and dashboard redesign (UI only)
- Q: what process do i need to view the unschedule
- chart.tsx
- toast.tsx
- notification-item.tsx
- Manual QA checklist — Scheduler & Academic Management refactor
- Obsidian CLI
- scheduler/page.tsx
- actions/auth.ts
- README.md
- constraints/manager.tsx
- auto.ts
- password-card.tsx
- assignment-proposal-actions.test.ts
- portal.ts
- Knap
- This is NOT the Next.js you know
- affected.ts
- rooms-explorer.tsx
- audit-workspace.tsx
- building-banner.tsx
- schedule.ts
- postcss.config.mjs
- 3. Server actions
- scripts
- generation-service.ts
- @prisma/client
- Defuddle
- assignment-proposal-actions.ts
- subjects-toolbar.tsx
- settings/manager.tsx
- calendar/actions.ts
- office-dashboards.tsx
- LegalPage
- landing.tsx
- assignment-offerings-actions.test.ts
- generation.ts
- coics-faculty.ts
- constraints.ts
- section-generation-service.test.ts
- curriculum-list.tsx
- rooms/actions.ts
- dotenv
- Embeds Reference
- System Overview
- override-metrics.ts
- 2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5)
- 2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities
- ErrorState
- Q: Why are subjects not multiplied per section, and what is the recommended design?
- 2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user)
- Properties (Frontmatter) Reference
- 2026-10-30 Scheduler improvements, Phase 2
- replace-computing-curriculum.ts
- replace-room-catalog.ts
- program-actions.ts
- tokens.ts
- Callouts Reference
- AssistantChat
- assignment-actions.ts
- next-auth.d.ts
- subjects/types.ts
- SectionNeedsSummary
- Q: The auto-schedule doesnt work, the data assign doesnt connect to unschedule. What is the strongest recommendation?
- landing.tsx
- policy.ts
- levels.ts
- prisma.ts
- subject-offerings.test.ts
- users/page.tsx

## God Nodes (most connected - your core abstractions)
1. `Button()` - 280 edges
2. `react` - 186 edges
3. `requireScope()` - 175 edges
4. `@phosphor-icons/react` - 175 edges
5. `next` - 174 edges
6. `Badge()` - 154 edges
7. `prisma` - 133 edges
8. `formatRange()` - 128 edges
9. `vitest` - 119 edges
10. `Input()` - 109 edges

## Surprising Connections (you probably didn't know these)
- `Timetable` --references--> `n()`  [INFERRED]
  docs/QA-CHECKLIST.md → app/(dashboard)/constraints/categories.ts
- `Design notes` --references--> `RoomsExplorer()`  [INFERRED]
  docs/activity-log.md → app/(dashboard)/rooms/rooms-explorer.tsx
- `2026-11-13 - Academic level separation (phase 2)` --references--> `LevelTabs()`  [INFERRED]
  docs/activity-log.md → components/academics/level-tabs.tsx
- `2026-11-13 - Academic level tabs and strict level separation (phase 1)` --references--> `CollectionView()`  [INFERRED]
  docs/activity-log.md → components/ux/collection-view.tsx
- `Gotchas` --references--> `sendVerification()`  [INFERRED]
  docs/activity-log.md → lib/auth/verification.ts

## Import Cycles
- None detected.

## Communities (161 total, 5 thin omitted)

### Community 0 - "bookings/plan.ts"
Cohesion: 0.08
Nodes (41): approvalDepartment(), BookingMeta, BookingRequest, PlanSnapshot, blocked(), Clash, ClashReason, DatedAdjustment (+33 more)

### Community 1 - "profile/actions.ts"
Cohesion: 0.10
Nodes (36): ChangePasswordPage(), metadata, audit(), changePasswordAction(), confirmTwoFactorAction(), disableTwoFactorAction(), issueRecoveryCodes(), regenerateRecoveryCodesAction() (+28 more)

### Community 2 - "timetable/config.ts"
Cohesion: 0.07
Nodes (44): previewTimetableConfigurationAction(), esc(), FILLS, FitWidth(), PRINT_FILLS, printSheets(), scheduleSheetsHtml(), SectionSheet() (+36 more)

### Community 3 - "Button"
Cohesion: 0.11
Nodes (63): BulkAccounts(), removeProgramAssignmentAction(), ProgramAssignments(), remove(), AssignmentApprovalsWorkspace(), BookDialog(), classes(), slot() (+55 more)

### Community 4 - "constraint-dialog.tsx"
Cohesion: 0.10
Nodes (25): CATEGORIES, categoryOf(), CREATE_CATEGORIES, CreateCategory, createCategoryOf(), daysOff(), n(), range() (+17 more)

### Community 5 - "Field"
Cohesion: 0.08
Nodes (48): Audience, resendVerificationAction(), setOwnPasswordAction(), SetPasswordForm(), DepartmentField(), addDays(), Clock, durationLabel() (+40 more)

### Community 6 - "room-results.tsx"
Cohesion: 0.21
Nodes (13): daysBetween(), formatDay(), relativeDay(), TIME_ZONE, Availability(), BadgeLabel(), Cap, Caps (+5 more)

### Community 7 - "StatusPage"
Cohesion: 0.33
Nodes (6): ForbiddenPage(), metadata, Forbidden(), metadata, Unauthorized(), StatusPage()

### Community 8 - "scheduler/actions.ts"
Cohesion: 0.08
Nodes (43): classSchema, DAY, deleteClassAction(), moveClassAction(), moveSchema, publishClassesAction(), Result, saveClassAction() (+35 more)

### Community 9 - "workload-board.tsx"
Cohesion: 0.13
Nodes (23): metadata, WorkloadPage(), FacultyClasses(), MyLoad(), Summary, WorkloadBoard(), Tabs(), TabsContent() (+15 more)

### Community 10 - "scheduler-workspace.tsx"
Cohesion: 0.06
Nodes (72): ClassInput, ClassDialog(), ClassDraft, ClassForm(), describeOther(), hours(), LENGTH_CHIPS, STATUS_OPTIONS (+64 more)

### Community 11 - "Scope"
Cohesion: 0.11
Nodes (23): 2026-11-13 - Unpublished timetables hidden from faculty and students, availabilitySchema, createAssistantData(), execute(), source(), dateSchema, DAYS, definitions (+15 more)

### Community 12 - "package.json"
Cohesion: 0.04
Nodes (45): dependencies, @auth/prisma-adapter@^2.11.3, @base-ui/react@^1.8.0, bcryptjs@^3.0.3, class-variance-authority@^0.7.1, clsx@^2.1.1, cmdk@^1.1.1, cn@^0.3.0 (+37 more)

### Community 13 - "DashboardActivityCalendar"
Cohesion: 0.26
Nodes (9): metadata, StudentDashboardPage(), DashboardActivities(), DashboardActivity, DashboardActivityCalendar(), navigate(), StudentLanding(), mocks (+1 more)

### Community 14 - "view-assigned-panel.tsx"
Cohesion: 0.14
Nodes (28): archiveDate(), ArchivedList(), restore(), restoreButton(), recordName(), bookingTimelineAction(), reviewOverrideAction(), ACK (+20 more)

### Community 15 - "react"
Cohesion: 0.06
Nodes (46): FormState, Kind, KINDS, Option, TIMES, Department, Decision, DecisionPanel() (+38 more)

### Community 16 - "seed.ts"
Cohesion: 0.09
Nodes (26): BASIC_EDUCATION_DEPARTMENTS, clearSchedules(), db, addBookingSamples(), JS_DAYS, addScopeAndExamSamples(), day(), Busy (+18 more)

### Community 17 - "shortcuts.tsx"
Cohesion: 0.13
Nodes (17): GlobalSearch(), handleChange(), handleKeyDown(), handleSelect(), GROUP_ICONS, SearchResult, Kbd(), Ctx (+9 more)

### Community 18 - "workload/actions.ts"
Cohesion: 0.12
Nodes (27): approveProposalAction(), recheckWorkloadAction(), rejectProposalAction(), recheck(), approve(), reject(), report(), FacultyTransfer() (+19 more)

### Community 19 - "Card"
Cohesion: 0.06
Nodes (84): metadata, ViewAsPage(), Option, TABLES, Totals, saveAvailableDaysAction(), AvailabilityForm(), preview() (+76 more)

### Community 20 - "bookings/service.ts"
Cohesion: 0.05
Nodes (98): BatchView, ReportView, AdjustmentsPage(), CAUSE_LABELS, metadata, respond(), availabilityAction(), bookSchema (+90 more)

### Community 21 - "Obsidian Bases Skill"
Cohesion: 0.04
Nodes (44): Any Type Functions, Date Arithmetic, Date Functions & Fields, Duration Type, File Functions, Functions Reference, Global Functions, Link Functions (+36 more)

### Community 22 - "theme-provider.tsx"
Cohesion: 0.15
Nodes (20): geistMono, inter, jakarta, metadata, RootLayout(), Providers(), toggleTheme(), Toaster() (+12 more)

### Community 23 - "requests/manager.tsx"
Cohesion: 0.07
Nodes (47): PAGE_SIZES, sortValue(), Compare(), DOT, fields, RequestDrawer(), Step, timeline() (+39 more)

### Community 24 - "lib/scheduler/types.ts"
Cohesion: 0.08
Nodes (30): ConflictContext, detectConflicts(), MAX_DAILY_MINUTES, push(), termsConcurrent(), FacultyWithAvailability, RoomWithAvailability, toSchedEntry() (+22 more)

### Community 25 - "report-table.tsx"
Cohesion: 0.10
Nodes (22): AFFECT_COLOR, AFFECT_LABEL, affectText(), FilterSelect(), formatTime(), Option, ReportRow, Row (+14 more)

### Community 26 - "resolve-actions.ts"
Cohesion: 0.09
Nodes (46): applyRepairAction(), applySchema, changeSchema, DAY, entrySchema, noticeFaculty(), Result, SAME (+38 more)

### Community 27 - "formatRange"
Cohesion: 0.06
Nodes (46): DAYS, GridEntry, gridKeyboardCoordinates, Block, DayColumn(), dayDroppableId(), DropPreview, entryDraggableId() (+38 more)

### Community 28 - "Badge"
Cohesion: 0.13
Nodes (44): fmt(), metadata, QUEUES, ReviewCenterPage(), words(), ReviewInbox(), ReviewKind, ReviewRow (+36 more)

### Community 29 - "components/scheduler/types.ts"
Cohesion: 0.18
Nodes (17): ACTIVE_TERMS, DEPENDENTS, Filters, KEYS, sectionMatches(), useSchedulerFilters(), ACADEMIC_LEVELS, ALL_ACTIVE_TERMS (+9 more)

### Community 30 - "components.json"
Cohesion: 0.09
Nodes (21): aliases, components, hooks, lib, ui, utils, iconLibrary, menuAccent (+13 more)

### Community 31 - "users/actions.ts"
Cohesion: 0.05
Nodes (62): assignDepartmentHeadAction(), departmentSchema, refreshDepartments(), removeDepartmentHeadAssignmentAction(), Result, saveDepartmentAction(), DepartmentManager(), assign() (+54 more)

### Community 32 - "roles.ts"
Cohesion: 0.09
Nodes (40): activateTerm(), createDefaultTermsAction(), deleteAcademicYearAction(), deleteTermAction(), Result, revalidate(), saveAcademicYearAction(), saveTermAction() (+32 more)

### Community 33 - "scheduler/auto-schedule.ts"
Cohesion: 0.12
Nodes (27): applyAutoScheduleAction(), ids, previewAutoScheduleAction(), generate(), applyAutoSchedule(), autoScheduleBasis(), AutoScheduleError, previewAutoSchedule() (+19 more)

### Community 34 - "solver.ts"
Cohesion: 0.09
Nodes (52): COUNTS, ResolveReview(), slot(), onDragStart(), Message, ResolverProgress, splitPolicyMinutes(), Cause (+44 more)

### Community 35 - "Data Design"
Cohesion: 0.06
Nodes (32): Data Design, SubjectAssignmentProposal, Supporting tables not detailed above, Table 10. FacultyAvailability, Table 11. Student, Table 12. Building, Table 13. Floor, Table 14. Room (+24 more)

### Community 36 - "analytics-charts.tsx"
Cohesion: 0.21
Nodes (22): Card, dashboardAnalytics(), DashboardFilters, pctText(), previousTerm(), termFigures(), upcoming(), byGroup() (+14 more)

### Community 37 - "compilerOptions"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 38 - "export/report.ts"
Cohesion: 0.12
Nodes (28): ActivitiesReportButtons(), ReportButtons(), RoomAssignmentRow, RoomAssignmentsReportButtons(), withoutQuarterTerms(), cell(), Column, downloadText() (+20 more)

### Community 39 - "resolve-issues.tsx"
Cohesion: 0.11
Nodes (30): narrateRepairAction(), repairStampAction(), AutoScheduleDialog(), apply(), close(), Scope, STAGES, ProcessAnimation() (+22 more)

### Community 40 - "suspensions/actions.ts"
Cohesion: 0.10
Nodes (26): applySuspensionAction(), checked(), ContinuityError, DATE, fingerprint(), liftSuspensionAction(), notifyStudents(), plan() (+18 more)

### Community 41 - "department/actions.ts"
Cohesion: 0.08
Nodes (38): GET(), GET(), ACTIONS, DELETE(), guard(), POST(), record(), removeUserAvatarAction() (+30 more)

### Community 42 - "lib/calendar.ts"
Cohesion: 0.10
Nodes (26): CalendarEvent, MonthGrid(), Chip(), Conflicts, conflictText(), DAY_END, DAY_START, EventCell() (+18 more)

### Community 43 - "subjects/actions.ts"
Cohesion: 0.17
Nodes (14): clean(), createSubjectRequestAction(), Result, schema, splitHours(), submit(), kindLabel(), REASON_MAX (+6 more)

### Community 44 - "NativeSelect"
Cohesion: 0.17
Nodes (25): previewConstraintAction(), DEFAULT_PARAMS, Params, ClassPolicyFields(), inferTargetType(), PolicySettingsFields(), PolicyTargetFields(), PolicyTargetType (+17 more)

### Community 45 - "[buildingId]/page.tsx"
Cohesion: 0.33
Nodes (6): BuildingPage(), metadata, RoomsPage(), loadBuildings(), roomFormOptions(), designation()

### Community 46 - "JSON Canvas Skill"
Cohesion: 0.08
Nodes (26): Flowchart, JSON Canvas Complete Examples, Project Board with Groups, Research Canvas with Files and Links, Simple Canvas with Text and Connections, 1. Create a New Canvas, 2. Add a Node to an Existing Canvas, 3. Connect Two Nodes (+18 more)

### Community 47 - "AvatarDialog"
Cohesion: 0.18
Nodes (13): AvatarButton(), AvatarDialog(), capture(), change(), fail(), remove(), stopCamera(), upload() (+5 more)

### Community 48 - "proposal-workspace.tsx"
Cohesion: 0.10
Nodes (33): day(), Input, previewProposalAction(), proposalSchema, refresh(), Result, rowSchema, saveProposalDraftAction() (+25 more)

### Community 49 - "@phosphor-icons/react"
Cohesion: 0.04
Nodes (58): createFacultyAccountsBulkAction(), categories, checkRows(), roleOf(), Account, STATUS_LABEL, STATUS_STYLE, ROLES (+50 more)

### Community 50 - "policy-admin.ts"
Cohesion: 0.17
Nodes (17): ConstraintsPage(), metadata, changeContext(), levelForGrade(), policyMatches(), previewClassPolicy(), validatePolicyTarget(), departmentLevels() (+9 more)

### Community 51 - "package.json"
Cohesion: 0.07
Nodes (35): eslintConfig, allowScripts, esbuild@0.28.2, prisma@7.10.0, @prisma/engines@7.10.0, unrs-resolver@1.12.2, devDependencies, eslint@^9 (+27 more)

### Community 52 - "programs/page.tsx"
Cohesion: 0.17
Nodes (17): DepartmentProfilePage(), metadata, DepartmentProfiles(), ProfileSection(), metadata, ProgramsPage(), metadata, ReportsPage() (+9 more)

### Community 53 - "requireScope"
Cohesion: 0.07
Nodes (64): allowed(), archiveRecordAction(), ArchiveResult, departmentOf(), PATHS, REFUSED, restoreRecordAction(), schema (+56 more)

### Community 54 - "breadcrumbs.tsx"
Cohesion: 0.19
Nodes (11): AssignmentApprovalsPage(), metadata, BreadcrumbItem, buildBreadcrumbs(), CONTEXTUAL, LEVEL_LABELS, PAGE_LABELS, pageLabel() (+3 more)

### Community 55 - "states.tsx"
Cohesion: 0.09
Nodes (48): FIELDS, fmt(), Year, YearsManager(), FacultyPreferences(), initials(), FacultyBrowser(), FacultyRow (+40 more)

### Community 56 - "notifications-list.tsx"
Cohesion: 0.33
Nodes (13): FacultyPopover(), sectionsOf(), SubjectsToolbar(), AssistantWidget(), NotificationsMenu(), Popover(), PopoverClose(), PopoverContent() (+5 more)

### Community 57 - "requests/actions.ts"
Cohesion: 0.13
Nodes (27): cancelRequestAction(), createRequestAction(), day(), label(), minutes(), prepare(), requestFacultyChangeAction(), Result (+19 more)

### Community 58 - "notifications/service.ts"
Cohesion: 0.26
Nodes (13): GET(), listRecentNotificationsAction(), markAllNotificationsReadAction(), markNotificationReadAction(), metadata, NotificationsPage(), requireAccount(), notificationSummary() (+5 more)

### Community 59 - "command.tsx"
Cohesion: 0.16
Nodes (16): clock(), dayName(), Label(), Problem(), RequestFormModal(), ScheduleCombobox(), ScheduleOption, Command() (+8 more)

### Community 60 - "BookingWorkspace"
Cohesion: 0.23
Nodes (16): bookRoomAction(), cancelBookingAction(), editBookingAction(), findRoomsAction(), revalidate(), shortenBookingAction(), today(), BookingWorkspace() (+8 more)

### Community 61 - "formatRange"
Cohesion: 0.06
Nodes (76): AdjustmentRequest, applyAdjustmentAction(), authorize(), base, batchEnd(), batchScope(), checked(), choiceSchema (+68 more)

### Community 62 - "levelLabel"
Cohesion: 0.10
Nodes (26): AcademicYearDetailPage(), metadata, AnalyticsPage(), metadata, LEVEL_OPTIONS, LEVEL_OPTIONS, OverrideReport(), AdminPanels() (+18 more)

### Community 63 - "routes.ts"
Cohesion: 0.18
Nodes (12): authConfig, isPublicPath(), PUBLIC_PATHS, SUGGESTIONS, SUPER_ROLES, TEACHING_ROLES, canAccessPath(), isStudentArea() (+4 more)

### Community 64 - "Obsidian Flavored Markdown Skill"
Cohesion: 0.15
Nodes (13): Comments, Complete Example, Diagrams (Mermaid), Embeds, Footnotes, Internal Links (Wikilinks), Math (LaTeX), Obsidian Flavored Markdown Skill (+5 more)

### Community 65 - "booking-workspace.tsx"
Cohesion: 0.24
Nodes (8): Loading(), Loading(), Loading(), Loading(), Loading(), SchedulerLoading(), Loading(), Skeleton()

### Community 66 - "AuthShell"
Cohesion: 0.16
Nodes (15): verifyEmailToken(), ForgotPasswordPage(), metadata, metadata, ResetPasswordPage(), metadata, StudentForgotPasswordPage(), metadata (+7 more)

### Community 67 - "specs.ts"
Cohesion: 0.16
Nodes (18): GRADE_LEVELS, COLUMNS, GRADES, ImportColumn, ImportKind, LEVELS, norm(), num() (+10 more)

### Community 68 - "(dashboard)/layout.tsx"
Cohesion: 0.11
Nodes (34): DashboardLayout(), StudentPortalLayout(), MobileNav(), activeHrefFor(), ADMIN, allowedHrefsForRole(), collapse(), filterNavForRole() (+26 more)

### Community 69 - "watchIdleSession"
Cohesion: 0.19
Nodes (15): key(), ACTIVITY_EVENTS, IdleSessionState, StoredActivity, watchIdleSession(), activity(), check(), expire() (+7 more)

### Community 70 - "assistant/actions.ts"
Cohesion: 0.12
Nodes (28): ChatMessage, getAssistantHistory(), latestConversation(), messageSchema, sendAssistantMessageAction(), toChatMessage(), assistantPage(), assistantPageSchema (+20 more)

### Community 71 - "topbar.tsx"
Cohesion: 0.24
Nodes (18): Chips(), RuleRow(), ScopeBadge(), StatusControl(), StrengthBadge(), Details(), NavGroups(), readOpen() (+10 more)

### Community 72 - "overview.tsx"
Cohesion: 0.29
Nodes (11): StatGrid(), Hint(), OverviewSkeleton(), StatusTag(), StudentOverview(), titleCase(), greeting(), startsIn() (+3 more)

### Community 73 - "UserAvatar"
Cohesion: 0.27
Nodes (8): Avatar(), AvatarFallback(), AvatarImage(), colorOf(), COLORS, initials(), UserAvatar(), smallAvatarUrl()

### Community 74 - "timetables/[id]/page.tsx"
Cohesion: 0.11
Nodes (30): ChangeList(), classSheets(), examConflicts(), fmt(), metadata, SnapshotTable(), TimetableReviewPage(), CommentBox() (+22 more)

### Community 75 - "CLAUDE.md"
Cohesion: 0.17
Nodes (10): Academic Levels, AI Restrictions, Code Quality, Core Features, Design and Technical Requirements, General Principles, Light Text Rule (Strict), Naming Rules (+2 more)

### Community 76 - "Activity Log"
Cohesion: 0.05
Nodes (42): 2026-10-14 - Role dashboards (commit 752bf31), 2026-10-31 Mobile and tablet pass (code review, no browser), 2026-10-31 Room Booking redesign (UI only), 2026-10-31 Scheduler: Resolve issues, 2026-10-31 Scheduling Constraints redesign (UI only), 2026-10-31 Speed pass, 2026-11-01 Subject Assigning, 2026-11-03 Audit Logs limited to the Administrator (+34 more)

### Community 77 - "session-list.tsx"
Cohesion: 0.20
Nodes (28): BookingsList(), classes(), COLUMNS, exportRows(), Tab, RequestsManager(), decide(), constraintReportAction() (+20 more)

### Community 78 - "examinations/auto-schedule.ts"
Cohesion: 0.11
Nodes (24): addDay(), AutoScheduleClass, AutoScheduleExisting, AutoScheduleResult, AutoScheduleUnavailability, Availability, classKey(), compareClasses() (+16 more)

### Community 79 - "calendar-board.tsx"
Cohesion: 0.10
Nodes (31): ActivitiesTable(), dateText(), monthOf(), scopeText(), timeText(), typeLabel(), TYPES, Decision (+23 more)

### Community 80 - "side-panels.tsx"
Cohesion: 0.29
Nodes (11): ConflictsPanel(), FindingItem(), Fix, needDraggableId(), NeedItem(), RoomSuggestions(), TYPE_LABEL, UnscheduledPanel() (+3 more)

### Community 81 - "templates.ts"
Cohesion: 0.69
Nodes (8): accountApprovedEmail(), button(), escape(), layout(), p(), passwordChangedEmail(), passwordResetEmail(), verificationEmail()

### Community 82 - "AuthShell"
Cohesion: 0.08
Nodes (29): requiresAdminApproval(), GET, POST, dynamic, GET(), body, POST(), LoginPage() (+21 more)

### Community 83 - "2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler)"
Cohesion: 0.33
Nodes (6): 2026-10-13 - Full feature set build (branch refactor/academic-levels-scheduler), Decisions (confirmed with the user), Design notes, Gotchas, Progress (all done, 11 commits 773d893..6e2b15b), Verification

### Community 84 - "2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements)"
Cohesion: 0.40
Nodes (5): 2026-10-30 Scheduler improvements, Phase 1 (branch feature/scheduler-improvements), Changes, Decisions (user), Findings, Gotchas

### Community 85 - "zod"
Cohesion: 0.18
Nodes (14): AssignableFaculty, AssignableSubject, AssignmentInput, assignmentSchema, assignmentWarnings(), subjectLoad(), applyChanges(), LoadTone (+6 more)

### Community 86 - "formatRange"
Cohesion: 0.20
Nodes (18): line(), MovedList(), MovedTag(), DayAgenda(), isWide(), ListView(), mergeRuns(), options() (+10 more)

### Community 87 - "dashboard-summary.test.ts"
Cohesion: 0.36
Nodes (7): move(), headLanding(), Component, latestTimetables(), sectionReadiness(), teachingDay(), TeachingSession

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

### Community 92 - "notification-item.tsx"
Cohesion: 0.19
Nodes (17): NotificationsList(), NotificationEmpty(), NotificationFeed(), NotificationSkeleton(), icons, labels, NotificationItem(), tints (+9 more)

### Community 93 - "Manual QA checklist — Scheduler & Academic Management refactor"
Cohesion: 0.13
Nodes (14): 1. Drag and drop, 2. Keyboard, 3. Conflict detection, 4. Academic setup, 5. Removed features, 6. States & accessibility, Global, Manual QA checklist — Scheduler & Academic Management refactor (+6 more)

### Community 94 - "Obsidian CLI"
Cohesion: 0.20
Nodes (9): Additional developer commands, Command reference, Common patterns, Develop/test cycle, File targeting, Obsidian CLI, Plugin development, Syntax (+1 more)

### Community 95 - "scheduler/page.tsx"
Cohesion: 0.18
Nodes (14): day(), ExamMode(), location(), metadata, SchedulerPage(), AcademicYearSwitcher(), ModeSwitch(), SchedulerMode (+6 more)

### Community 96 - "actions/auth.ts"
Cohesion: 0.10
Nodes (38): ActionResult, fieldErrors(), findUserByEmail(), forgotPasswordAction(), ip(), matchesAudience(), registerAction(), resetPasswordAction() (+30 more)

### Community 97 - "README.md"
Cohesion: 0.50
Nodes (3): Deploy on Vercel, Getting Started, Learn More

### Community 98 - "constraints/manager.tsx"
Cohesion: 0.11
Nodes (26): allowed(), ConstraintInput, deleteConstraintAction(), Result, revalidate(), saveConstraintAction(), schema, toggleConstraintAction() (+18 more)

### Community 99 - "auto.ts"
Cohesion: 0.04
Nodes (108): AssignmentProposalRow, FacultyPage(), metadata, metadata, RequestsPage(), submitClassesAction(), editProposalRowAction(), Result (+100 more)

### Community 100 - "password-card.tsx"
Cohesion: 0.12
Nodes (19): metadata, ProfilePage(), SECTIONS, OtpInput(), PasswordCard(), RULES, PasswordField(), SectionNav() (+11 more)

### Community 101 - "assignment-proposal-actions.test.ts"
Cohesion: 0.18
Nodes (10): submitDecision(), ProposalError, reviewAssignmentProposalAction(), input, m, proposal, section, subject (+2 more)

### Community 102 - "portal.ts"
Cohesion: 0.21
Nodes (16): metadata, StudentCalendarPage(), metadata, StudentSchedulePage(), metadata, shortDay(), StudentSubjectsPage(), NoSectionState() (+8 more)

### Community 103 - "Knap"
Cohesion: 0.33
Nodes (5): Batch rendering, Defuddle pipeline, Knap, Templates, Usage

### Community 105 - "affected.ts"
Cohesion: 0.21
Nodes (10): activityApplies(), Affect, affectsOf(), ReportActivity, ReportClass, virtualClassPlan(), before, cancelled (+2 more)

### Community 106 - "rooms-explorer.tsx"
Cohesion: 0.17
Nodes (15): Program, Activity, Deleting, Editor, RoomListRow, TYPE_TINT, ActionResult, 5. Database and Storage (+7 more)

### Community 107 - "audit-workspace.tsx"
Cohesion: 0.25
Nodes (13): AuditWorkspace(), timestamp(), valueText(), AuditLogsPage(), metadata, auditChanges(), AuditFilters, AuditJson (+5 more)

### Community 108 - "building-banner.tsx"
Cohesion: 0.26
Nodes (12): BuildingDialog(), BuildingBanner(), BuildingArt(), BUILDING_PURPOSES, BuildingPurpose, buildingStatus(), hoursText(), photoUrl() (+4 more)

### Community 109 - "schedule.ts"
Cohesion: 0.23
Nodes (13): ActivityTypeBadge(), NoticeBanner(), read(), subscribe(), ViewProps, AFFECTS_CLASSES, manilaNow(), NO_CLASS_TYPES (+5 more)

### Community 111 - "3. Server actions"
Cohesion: 0.13
Nodes (11): archive(), 1. Route handlers, 2. Page routes and role access, 3. Server actions, 4. Response conventions and errors, 5. Not found / unclear, API Reference, Overview (+3 more)

### Community 112 - "scripts"
Cohesion: 0.18
Nodes (11): scripts, audit:owners, build, check, dev, lint, postinstall, start (+3 more)

### Community 113 - "generation-service.ts"
Cohesion: 0.21
Nodes (12): Callouts, countsSelect, Db, failure(), generateSectionBatch(), GenerationError, inputSchema, keysSchema (+4 more)

### Community 114 - "@prisma/client"
Cohesion: 0.05
Nodes (65): addTimetableCommentAction(), commentSchema, decideTimetableAction(), decisionSchema, refresh(), Result, decide(), ExamInput (+57 more)

### Community 115 - "Defuddle"
Cohesion: 0.50
Nodes (3): Defuddle, Output formats, Usage

### Community 116 - "assignment-proposal-actions.ts"
Cohesion: 0.22
Nodes (10): save(), createAssignmentProposalsAction(), decisionSchema, Result, slotKey(), facultyAssignmentRoute(), assignableFaculty(), day() (+2 more)

### Community 117 - "subjects-toolbar.tsx"
Cohesion: 0.21
Nodes (11): exportCsv(), CATEGORIES, FilterChip, SORTS, cell(), PersonLoad, STATUS_FILTERS, STATUS_LABELS (+3 more)

### Community 118 - "settings/manager.tsx"
Cohesion: 0.30
Nodes (10): setRequireApprovalAction(), updateBookingSettingsAction(), updateInstitutionAction(), updateWorkloadAction(), SettingsManager(), handleBooking(), handleSave(), handleWorkload() (+2 more)

### Community 119 - "calendar/actions.ts"
Cohesion: 0.21
Nodes (11): ActivityInput, activitySchema, DECISION_TEXT, deleteActivityAction(), Result, revalidate(), reviewActivitiesAction(), reviewSchema (+3 more)

### Community 120 - "office-dashboards.tsx"
Cohesion: 0.08
Nodes (62): DashboardPage(), LANDING, metadata, ClassFocus(), dashboardLink, DashboardOverview(), ICON_TONES, LandingMetric (+54 more)

### Community 121 - "LegalPage"
Cohesion: 0.39
Nodes (5): metadata, PrivacyPage(), metadata, TermsPage(), LegalPage()

### Community 122 - "landing.tsx"
Cohesion: 0.31
Nodes (7): metadata, StudentProfilePage(), STUDENT_LINK, StudentEmpty(), StudentPanel(), account, mocks

### Community 123 - "assignment-offerings-actions.test.ts"
Cohesion: 0.25
Nodes (6): input, m, scope, sections, subject, sync

### Community 124 - "generation.ts"
Cohesion: 0.33
Nodes (10): distributeLearners(), ExistingGenerationSection, generateSectionNames(), GenerationPreviewRow, nextSectionIndex(), planSectionGeneration(), SectionGenerationContext, sectionSuffix() (+2 more)

### Community 125 - "coics-faculty.ts"
Cohesion: 0.11
Nodes (24): load(), onFile(), EMPLOYEE_ID_PREFIX, employeeIdSchema, columnIndex(), inflate(), parseDelimited(), readXlsx() (+16 more)

### Community 126 - "constraints.ts"
Cohesion: 0.07
Nodes (43): AutoScheduleRoom, roomAllowsSection(), RoomDesignation, SCHOOL_LEVELS, SectionDesignation, applies(), APPLIES_TO, clock() (+35 more)

### Community 127 - "section-generation-service.test.ts"
Cohesion: 0.22
Nodes (8): sectionGenerationContext(), deps, input(), keys, mocks, scope, settings, time

### Community 128 - "curriculum-list.tsx"
Cohesion: 0.09
Nodes (39): RuleActions(), RowMenu(), BuildingDetails, BuildingsOverview(), BuildingSummary, RoomReportRow, Sort, SORTS (+31 more)

### Community 129 - "rooms/actions.ts"
Cohesion: 0.22
Nodes (17): buildingSchema, deleteBuildingAction(), deleteFloorAction(), done(), floorSchema, minutes, PHOTO_TYPES, removeBuildingPhotoAction() (+9 more)

### Community 130 - "dotenv"
Cohesion: 0.10
Nodes (15): pg@^8.23.0, @prisma/adapter-pg@^7.10.0, dotenv@^17.4.2, dotenv, pg, @prisma/adapter-pg, apply, prisma (+7 more)

### Community 131 - "Embeds Reference"
Cohesion: 0.22
Nodes (9): Embed Audio, Embed Bases, Embed Images, Embed Lists, Embed Notes, Embed PDF, Embed Search Results, Embeds Reference (+1 more)

### Community 133 - "System Overview"
Cohesion: 0.14
Nodes (14): 10. Testing and Code Quality, 11. Security Observations, 12. How to Run Locally, 13. Architecture Diagram, 14. Gaps and Recommendations, 1. Project Overview, 2. Tech Stack Summary, 3. Frontend (+6 more)

### Community 135 - "override-metrics.ts"
Cohesion: 0.22
Nodes (9): hasResponse(), OVERRIDE_RESPONSE_LABELS, OverrideEntry, overrideMetrics(), overrideResponse(), OverrideResponseState, rank(), responseDuration() (+1 more)

### Community 136 - "2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5)"
Cohesion: 0.67
Nodes (3): 2026-10-14 - Administrator analytics and continuous workload balancing (commits e60d408, 12a18a5), Gotchas, What changed

### Community 137 - "2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities"
Cohesion: 0.67
Nodes (3): 2026-10-21 - Archive instead of delete, activity approvals, activities table, schedule report activities, Decisions (confirmed with the user), Gotchas

### Community 138 - "ErrorState"
Cohesion: 0.33
Nodes (5): DashboardError(), ProgramsError(), RequestsError(), SubjectsError(), ErrorState()

### Community 139 - "Q: Why are subjects not multiplied per section, and what is the recommended design?"
Cohesion: 0.50
Nodes (3): Answer, Q: Why are subjects not multiplied per section, and what is the recommended design?, Source Nodes

### Community 140 - "2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user)"
Cohesion: 0.67
Nodes (3): 2026-10-21 - Rooms redesigned as a buildings overview (reference screenshot from the user), Decisions (confirmed with the user), Design notes

### Community 142 - "Properties (Frontmatter) Reference"
Cohesion: 0.25
Nodes (4): Default Properties, Properties (Frontmatter) Reference, Property Types, Tags

### Community 143 - "2026-10-30 Scheduler improvements, Phase 2"
Cohesion: 0.67
Nodes (3): 2026-10-30 Scheduler improvements, Phase 2, Changes, Gotchas

### Community 144 - "replace-computing-curriculum.ts"
Cohesion: 0.18
Nodes (15): COMPUTING_ACADEMIC_YEAR, COMPUTING_CURRICULA, computingSubjects(), CurriculumYear, elective, firstYear, fitness, SubjectRow (+7 more)

### Community 145 - "replace-room-catalog.ts"
Cohesion: 0.22
Nodes (14): normalize(), ownerDepartments(), previewRoomCatalog(), replaceRoomCatalog(), verifyRoomCatalog(), RoomOwner, RoomRow, SUPPLIED_ROOM_BUILDINGS (+6 more)

### Community 146 - "program-actions.ts"
Cohesion: 0.36
Nodes (7): assignProgramAction(), homeDepartments(), Input, schema, updateProgramAssignmentAction(), validate(), add()

### Community 147 - "tokens.ts"
Cohesion: 0.50
Nodes (5): generateToken(), hashToken(), consumeRecoveryCode(), hashRecoveryCode(), issueToken()

### Community 148 - "Callouts Reference"
Cohesion: 0.33
Nodes (6): Basic Callout, Callouts Reference, Custom Callouts (CSS), Foldable Callouts, Nested Callouts, Supported Callout Types

### Community 149 - "AssistantChat"
Cohesion: 0.40
Nodes (6): clearAssistantHistoryAction(), AssistantChat(), clear(), send(), renderBold(), suggestions()

### Community 150 - "assignment-actions.ts"
Cohesion: 0.29
Nodes (10): checkSchema, Result, revalidate(), saveAssignmentPlanAction(), AssignmentCurriculumError, AssignmentSlot, syncAssignedCurriculum(), offeringMatches() (+2 more)

### Community 151 - "next-auth.d.ts"
Cohesion: 0.33
Nodes (5): @auth/core/jwt, JWT, next-auth, Session, User

### Community 152 - "subjects/types.ts"
Cohesion: 0.50
Nodes (3): AssignmentRow, RequestStatusValue, SubjectRequestInfo

### Community 153 - "SectionNeedsSummary"
Cohesion: 0.67
Nodes (4): sectionGroups(), SectionNeedsSummary(), 2026-11-15 - Redesign of the Unscheduled lists in the scheduler, 2026-11-15 - Removed the "Where to look" card from the scheduler

### Community 154 - "Q: The auto-schedule doesnt work, the data assign doesnt connect to unschedule. What is the strongest recommendation?"
Cohesion: 0.50
Nodes (3): Answer, Q: The auto-schedule doesnt work, the data assign doesnt connect to unschedule. What is the strongest recommendation?, Source Nodes

### Community 155 - "landing.tsx"
Cohesion: 0.22
Nodes (18): ACTIVITY_COLORS, ActivityCard(), DOTS, StudentActivityCalendar(), goToMonth(), calendarDays(), monthActivities(), monthLabel() (+10 more)

### Community 156 - "policy.ts"
Cohesion: 0.05
Nodes (51): resolve(), Can(), usePermission(), ScopedDropdown(), ScopedOption, 2026-10-29 - Head of Department scope, merged Scheduler (steps 1 to 3), Decisions (confirmed with the user), Design notes (+43 more)

### Community 161 - "levels.ts"
Cohesion: 0.05
Nodes (75): metadata, metadata, SectionsPage(), SectionTermFilters(), metadata, SubjectsPage(), SubjectSemesterFilter(), SubjectFormDialog() (+67 more)

### Community 168 - "prisma.ts"
Cohesion: 0.05
Nodes (57): ADMIN, bookingSchema, schema, time, workloadSchema, metadata, SettingsPage(), CalendarTab (+49 more)

### Community 171 - "subject-offerings.test.ts"
Cohesion: 0.50
Nodes (3): section, subject, term

### Community 172 - "users/page.tsx"
Cohesion: 0.19
Nodes (13): ArchivedPage(), metadata, metadata, UsersPage(), UserTabs(), NOT_ARCHIVED, ArchiveKind, ARCHIVED (+5 more)

## Knowledge Gaps
- **1 isolated node(s):** `RFC-6238`
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1309 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `next` connect `@phosphor-icons/react` to `curriculum-list.tsx`, `profile/actions.ts`, `rooms/actions.ts`, `Button`, `timetable/config.ts`, `Field`, `StatusPage`, `scheduler/actions.ts`, `workload-board.tsx`, `scheduler-workspace.tsx`, `package.json`, `view-assigned-panel.tsx`, `react`, `shortcuts.tsx`, `program-actions.ts`, `Card`, `bookings/service.ts`, `workload/actions.ts`, `assignment-actions.ts`, `theme-provider.tsx`, `landing.tsx`, `Badge`, `components/scheduler/types.ts`, `users/actions.ts`, `roles.ts`, `levels.ts`, `scheduler/auto-schedule.ts`, `solver.ts`, `resolve-issues.tsx`, `prisma.ts`, `department/actions.ts`, `suspensions/actions.ts`, `subjects/actions.ts`, `users/page.tsx`, `[buildingId]/page.tsx`, `proposal-workspace.tsx`, `package.json`, `programs/page.tsx`, `requireScope`, `breadcrumbs.tsx`, `states.tsx`, `notifications-list.tsx`, `requests/actions.ts`, `notifications/service.ts`, `formatRange`, `levelLabel`, `routes.ts`, `AuthShell`, `(dashboard)/layout.tsx`, `topbar.tsx`, `overview.tsx`, `timetables/[id]/page.tsx`, `session-list.tsx`, `calendar-board.tsx`, `AuthShell`, `formatRange`, `notification-item.tsx`, `actions/auth.ts`, `constraints/manager.tsx`, `auto.ts`, `password-card.tsx`, `assignment-proposal-actions.test.ts`, `rooms-explorer.tsx`, `audit-workspace.tsx`, `building-banner.tsx`, `@prisma/client`, `assignment-proposal-actions.ts`, `subjects-toolbar.tsx`, `calendar/actions.ts`, `office-dashboards.tsx`, `LegalPage`, `landing.tsx`?**
  _High betweenness centrality (0.093) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `requireScope()` (e.g. with `14. Gaps and Recommendations` and `4. Backend`) actually correct?**
  _`requireScope()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `RFC-6238` to the rest of the system?**
  _1 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `bookings/plan.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.07624113475177305 - nodes in this community are weakly interconnected._
- **Why does `Button()` connect `Button` to `curriculum-list.tsx`, `rooms/actions.ts`, `Field`, `room-results.tsx`, `StatusPage`, `workload-board.tsx`, `ErrorState`, `scheduler-workspace.tsx`, `DashboardActivityCalendar`, `view-assigned-panel.tsx`, `react`, `workload/actions.ts`, `Card`, `AssistantChat`, `requests/manager.tsx`, `report-table.tsx`, `landing.tsx`, `Badge`, `users/actions.ts`, `roles.ts`, `levels.ts`, `export/report.ts`, `resolve-issues.tsx`, `NativeSelect`, `AvatarDialog`, `proposal-workspace.tsx`, `@phosphor-icons/react`, `states.tsx`, `notifications-list.tsx`, `command.tsx`, `formatRange`, `AuthShell`, `(dashboard)/layout.tsx`, `topbar.tsx`, `timetables/[id]/page.tsx`, `session-list.tsx`, `calendar-board.tsx`, `formatRange`, `toast.tsx`, `notification-item.tsx`, `constraints/manager.tsx`, `password-card.tsx`, `rooms-explorer.tsx`, `audit-workspace.tsx`, `building-banner.tsx`, `schedule.ts`, `@prisma/client`, `subjects-toolbar.tsx`, `settings/manager.tsx`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Should `profile/actions.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.09716599190283401 - nodes in this community are weakly interconnected._
- **Why does `react` connect `react` to `curriculum-list.tsx`, `timetable/config.ts`, `Button`, `Field`, `room-results.tsx`, `override-metrics.ts`, `workload-board.tsx`, `ErrorState`, `scheduler-workspace.tsx`, `package.json`, `DashboardActivityCalendar`, `view-assigned-panel.tsx`, `shortcuts.tsx`, `workload/actions.ts`, `Card`, `theme-provider.tsx`, `requests/manager.tsx`, `report-table.tsx`, `landing.tsx`, `Badge`, `policy.ts`, `formatRange`, `components/scheduler/types.ts`, `roles.ts`, `levels.ts`, `solver.ts`, `export/report.ts`, `resolve-issues.tsx`, `prisma.ts`, `lib/calendar.ts`, `NativeSelect`, `AvatarDialog`, `proposal-workspace.tsx`, `@phosphor-icons/react`, `package.json`, `programs/page.tsx`, `requireScope`, `breadcrumbs.tsx`, `states.tsx`, `notifications-list.tsx`, `command.tsx`, `levelLabel`, `(dashboard)/layout.tsx`, `topbar.tsx`, `overview.tsx`, `UserAvatar`, `timetables/[id]/page.tsx`, `session-list.tsx`, `calendar-board.tsx`, `side-panels.tsx`, `formatRange`, `chart.tsx`, `toast.tsx`, `notification-item.tsx`, `scheduler/page.tsx`, `constraints/manager.tsx`, `password-card.tsx`, `portal.ts`, `rooms-explorer.tsx`, `audit-workspace.tsx`, `building-banner.tsx`, `schedule.ts`, `settings/manager.tsx`, `office-dashboards.tsx`, `landing.tsx`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._