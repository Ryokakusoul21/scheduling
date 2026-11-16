# Department Scope and RBAC Audit

Audit date: 2026-10-28. The “Resolution” column records the enforcement layer introduced by this change.

| Module | Endpoint or page | Original gap | Resolution |
|---|---|---|---|
| Authentication | Session and token refresh | Role refreshed, but authority came from one faculty department and had no acting dates | Active permanent and acting assignments are loaded on every request; inactive, suspended, and archived users fail policy checks |
| Permission helpers | Shared libraries | Resource-specific helpers duplicated role and department comparisons | Deny-by-default `can` and `scopeQuery` are the source of truth; subject, section, and department wrappers delegate to it |
| Scheduler | `/scheduler` | Loaded every schedule and faculty member, then filtered schedules in memory | Schedule and faculty rows are scoped in the database; Faculty receives only their own schedule rows |
| Analytics | `/analytics` | Loaded all departments and rooms before reducing results | Department and room queries now use the central scope before rows leave the database |
| Search | Global search | Separate resource filters could drift | Existing search filters now delegate through `departmentWhere` to `scopeQuery` |
| Reports and export | `/reports` | Queries were scoped by a separate helper with no single policy source | Existing report filters now delegate through `departmentWhere` to `scopeQuery` |
| Programs, subjects, sections | Pages and mutations | Correct in several paths, but implemented independently | Compatibility helpers call central policy; multi-department scope is honored |
| Examinations and schedules | Mutations | Owner was derived through nested records but not persisted | Stored section determines the ownership snapshot; browser department values are not accepted |
| Bookings and requests | Mutations | Ownership was implicit in requester or schedule | Server-derived department snapshots are persisted and indexed |
| Audit log | `/admin/audit-logs` | Administrator-only and entries lacked scope/reason context | Head of Department can see only own-department entries; blocked events include role, department, and reason |
| Blocked attempts | Mutations | Logged inconsistently with no escalation | Shared logger records context and notifies Administrators on repeated attempts |
| Direct identifiers | Server adapter | Missing and out-of-scope responses were inconsistent | `scopedRecordOrNotFound` provides the non-disclosing direct-link boundary |
| Interface permissions | Components | Pages contained local comparisons | `usePermission`, `Can`, and `ScopedDropdown` call the shared policy |
| Ownership integrity | Database | Schedules, examinations, bookings, adjustments, fixes, requests, notifications, and audit rows lacked owner snapshots | Safe nullable migration backfills stored relationships; `npm run audit:owners` reports unresolved rows |

## Backfill notes

Null ownership is valid only for intentionally shared resources. Run `npm run audit:owners` after migration, investigate every non-shared null, then make snapshot fields non-null in a follow-up constraint migration once production data is clean.
