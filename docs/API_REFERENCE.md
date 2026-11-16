# API Reference

Source: audit of `e:\Project\scheduling`. See [SYSTEM_OVERVIEW.md](SYSTEM_OVERVIEW.md) for context.

## Overview

The application has **two route handlers** and **91 exported server-action functions (28 files)**. Server actions are RPC calls bound to the UI: Next.js exposes each one at an internal, build-generated POST endpoint, so there is no stable public path and no OpenAPI description. Actions are called from client components by importing the function, and they return plain result objects (the checked actions return `{ ok: false, error }` style results, for example `app/(dashboard)/rooms/actions.ts`).

Tools: no Swagger, OpenAPI, Postman, GraphQL, gRPC or WebSocket files were found.

## 1. Route handlers

| Method | Path | Purpose | Auth required | Handler file |
|---|---|---|---|---|
| GET, POST | `/api/auth/*` (`signin`, `callback/credentials`, `session`, `csrf`, `signout`) | Auth.js v5 endpoints (Credentials provider, JWT session) | Public (the proxy allows `/api/auth`, `auth.config.ts`) | `app/api/auth/[...nextauth]/route.ts`, `auth.ts` |
| GET | `/api/data-version` | Returns `{ version: "<dot-joined timestamps and counts>" }` for live refresh; reveals no records. Responds `401 { error: "Sign in required" }` when signed out. Headers: `cache-control: no-store`; `dynamic = "force-dynamic"` | Any signed-in user (including students, since it only checks for a session) | `app/api/data-version/route.ts` |

Request and response formats: `/api/auth/*` follow Auth.js conventions (form-encoded credentials: `email`, `password`, `remember`, `code`, `captchaToken`, `portal`; validated by a zod schema in `auth.ts`). Login failures are mapped to `LoginError` codes (`invalid`, `captcha`, `rate_limited`, `locked`, `two_factor_required`, `two_factor_invalid`, `unverified`, `pending`, `inactive`; `lib/auth/errors.ts`).

The edge proxy (`proxy.ts`) guards every non-static path: public paths are listed in `auth.config.ts`; signed-out visitors get a redirect to `/login` (or `/student/login` for `/student/*`); disallowed roles get a rewrite to `/403` with status 403 (`lib/permissions/routes.ts`).

## 2. Page routes and role access

Route-level RBAC (`lib/permissions/routes.ts`). Paths not listed are open to any signed-in staff user; students may open only `/student/*`.

| Prefix | Allowed roles |
|---|---|
| `/admin`, `/academic-years` | Super Administrator, Registrar |
| `/admin/departments` | Registrar |
| `/admin/users`, `/admin/audit-logs`, `/admin/settings`, `/admin/view-as` | Super Administrator |
| `/bookings` | Registrar, Head of Department, Faculty |
| `/constraints`, `/adjustments` | Registrar, Head of Department |
| `/calendar/proposals`, `/programs`, `/subjects`, `/sections`, `/faculty`, `/rooms`, `/import`, `/reports`, `/analytics`, `/forecast` | Super Administrator, Registrar, Head of Department |
| `/availability` | Head of Department, Faculty |
| `/student/*` | Student only |

Public: `/`, `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/terms`, `/privacy`, `/403`, `/student/login`, `/student/register`, `/student/forgot-password`, `/student/reset-password`.

## 3. Server actions

Auth column legend: **user** = `requireUser()` (any signed-in non-student); **scope(...)** = `requireScope(roles)` returning the caller's department scope; **role(...)** = `requireRole(roles)`; **session scope** = `getScope()` (any signed-in non-student, then filtered by the caller's scope); **public** = no session check. "Staff" means Administrator and Head of Department; a Head of Department is limited to their own department where noted in the handler. Where a role is chosen per-function inside one file, the table lists what the file's `require*` calls show. Per-function mapping inside mixed files is **unclear** unless stated.

Validation: zod schemas are used in action files (for example `bookSchema` in bookings, `classSchema` and `moveSchema` in scheduler, ID arrays capped at 2000). Not every action file was confirmed to use zod; those not listed above are marked "unclear".

### Authentication (public)

| Action | Purpose | Auth | File |
|---|---|---|---|
| `registerAction` | Staff self-registration; sends verification email; honors the "require administrator approval" setting | public (CAPTCHA, rate cooldown) | `actions/auth.ts` |
| `studentRegisterAction` | Student self-registration | public (CAPTCHA) | `actions/student-auth.ts` |
| `resendVerificationAction`, `verifyEmailToken` | Resend or consume email verification link | public | `actions/auth.ts` |
| `forgotPasswordAction`, `resetPasswordAction` | Request and complete password reset (hashed single-use tokens) | public | `actions/auth.ts` |
| `requiresAdminApproval` | Reads the approval setting | public | `actions/auth.ts` |

### Profile, notifications, assistant

| Action | Purpose | Auth | File |
|---|---|---|---|
| `changePasswordAction`, `signOutEverywhereAction` | Password change; bumps `sessionVersion` | user | `app/(dashboard)/profile/actions.ts` |
| `startTwoFactorSetupAction`, `confirmTwoFactorAction`, `disableTwoFactorAction` | TOTP enrol and disable | user | same |
| `markNotificationReadAction`, `markAllNotificationsReadAction` | Notification state | user | `app/(dashboard)/notifications/actions.ts` |
| `getAssistantHistory`, `sendAssistantMessageAction`, `clearAssistantHistoryAction` | Gemini scheduling assistant | user | `app/(dashboard)/assistant/actions.ts` |
| `globalSearchAction` | Command-palette search | session scope | `components/layout/search-actions.ts` |

### Administration (Administrator)

| Action | Purpose | Auth | File |
|---|---|---|---|
| `createUserAction`, `updateUserAction`, `resetPasswordAction`, `approveUserAction` | User management | role(Administrator) | `app/(dashboard)/admin/users/actions.ts` |
| `updateInstitutionAction`, `updateWorkloadAction`, `setRequireApprovalAction` | System settings (teaching-load limits, approval switch) | role(Administrator) | `app/(dashboard)/admin/settings/actions.ts` |
| `bulkReviewAction` | Bulk review of pending items | scope(Administrator) | `app/(dashboard)/admin/review-center/actions.ts` |
| `saveAcademicYearAction`, `setActiveAcademicYearAction`, `deleteAcademicYearAction`, `saveTermAction`, `setActiveTermAction`, `deleteTermAction`, `createDefaultTermsAction` | Academic years and terms | role(Super Administrator, Registrar) | `app/(dashboard)/academic-years/actions.ts` |
| `archiveRecordAction`, `restoreRecordAction` | Soft delete and restore of users, faculty, subjects, rooms, sections | scope(staff) for archive, scope(Administrator) for restore (per-function mapping unclear) | `actions/archive.ts` |
| `reorderAction` | Reorder records | scope(staff) | `actions/reorder.ts` |

### Academic structure and rooms

| Action | Purpose | Auth | File |
|---|---|---|---|
| `saveProgramAction`, `deleteProgramAction` | Programs and strands | scope(staff) | `app/(dashboard)/programs/actions.ts` |
| `saveSubjectAction` | Subjects | scope(staff) | `app/(dashboard)/subjects/actions.ts` |
| `saveSectionAction` | Sections | scope(staff) | `app/(dashboard)/sections/actions.ts` |
| `createFacultyAction`, `updateFacultyAction` | Faculty records | scope(staff) | `app/(dashboard)/faculty/actions.ts` |
| `saveBuildingAction`, `uploadBuildingPhotoAction`, `removeBuildingPhotoAction`, `deleteBuildingAction`, `saveFloorAction`, `deleteFloorAction` | Buildings and floors (photo: JPEG, PNG or WebP, 1.5 MB cap) | role(Administrator) | `app/(dashboard)/rooms/actions.ts` |
| `saveRoomAction` | Rooms | scope(staff) | same |
| `validateImportAction`, `commitImportAction` | CSV or pasted bulk import: validate and preview, then save | scope(staff) | `app/(dashboard)/import/actions.ts` |

### Scheduling and examinations

| Action | Purpose | Auth | File |
|---|---|---|---|
| `saveClassAction`, `moveClassAction`, `deleteClassAction`, `constraintReportAction` | Class timetable edits with double-booking checks | scope(staff) | `app/(dashboard)/scheduler/actions.ts` |
| `submitClassesAction` | Head of Department submits classes for review | scope(Head of Department) | same |
| `publishClassesAction` | Publish classes | scope(`PUBLISH_ROLES` = Administrator) | same |
| `saveConstraintAction`, `toggleConstraintAction`, `deleteConstraintAction` | Scheduling constraints | scope(Registrar, Head of Department) | `app/(dashboard)/constraints/actions.ts` |
| `checkExamAction`, `saveExamAction`, `deleteExamAction`, `notifyExamAction`, `notifyExamsAction` | Examination schedule with room, proctor and section conflict checks | scope(staff) | `app/(dashboard)/examinations/actions.ts` |

### Calendar and room booking

| Action | Purpose | Auth | File |
|---|---|---|---|
| `saveActivityAction`, `deleteActivityAction` | Calendar activities | scope(staff) | `app/(dashboard)/calendar/actions.ts` |
| `reviewActivitiesAction` | Approve or reject activities | scope(Administrator) | same |
| `previewProposalAction`, `saveProposalDraftAction`, `submitProposalAction`, `reviewProposalAction` | Department activity proposals; Head of Department submits, Administrator reviews (exact split per function unclear) | scope(Head of Department / Administrator) | `app/(dashboard)/calendar/proposals/actions.ts` |
| `findRoomsAction`, `bookRoomAction`, `cancelBookingAction` | Room search, booking with automatic conflict resolution, cancel | scope(Registrar, Head of Department, Faculty) | `app/(dashboard)/bookings/actions.ts` |

### Adjustment, availability, workload, requests

| Action | Purpose | Auth | File |
|---|---|---|---|
| `previewAdjustmentAction`, `applyAdjustmentAction`, `undoAdjustmentAction`, `makeUpOptionsAction`, `scheduleMakeUpAction`, `dismissReportAction` | Dynamic schedule adjustment with before and after preview, undo, make-up options | scope(staff) | `app/(dashboard)/adjustments/actions.ts` |
| `reportUnavailabilityAction`, `withdrawReportAction`, `previewMyUnavailabilityAction` | Faculty unavailability reports | scope(Head of Department, Faculty) | `app/(dashboard)/availability/actions.ts` |
| `recheckWorkloadAction` | Recompute workload proposals | scope(staff) | `app/(dashboard)/workload/actions.ts` |
| `approveProposalAction`, `rejectProposalAction`, `undoFixAction` | Approve, reject, undo workload reassignments | scope(Administrator) per the file's two Administrator guards (mapping unclear) | same |
| `createRequestAction`, `requestFacultyChangeAction` | Create schedule or faculty-change requests | scope(Head of Department) (mapping unclear) | `app/(dashboard)/requests/actions.ts` |
| `reviewRequestAction` | Review requests | scope(Administrator) | same |

## 4. Response conventions and errors

- Server actions return result objects with an error message on failure rather than throwing (observed in `rooms/actions.ts`, `bookings/actions.ts`); a complete audit of every action's return type was not done.
- Guards that fail render the framework pages: `unauthorized()` (401, `app/unauthorized.tsx`) and `forbidden()` (403, `app/forbidden.tsx`) from `lib/auth/session.ts`.
- Bodies of server actions are limited to 2 MB (`next.config.ts`, `serverActions.bodySizeLimit`).
- Auth is enforced inside each action. The proxy does not guard action POSTs by role beyond the page path they originate from, so every new action must call a `require*` helper.

## 5. Not found / unclear

- Public REST API for third parties: none.
- Per-action role mapping for mixed-role files (`archive`, `calendar/proposals`, `requests`, `workload`): shown above only to the level the `require*` calls reveal.
- Whether `bookRoomAction` or other `getScope()` actions further restrict Faculty versus Head of Department: not verified.
- Rate limiting for actions other than login: not found.
