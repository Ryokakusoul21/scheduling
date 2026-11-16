# Data Design

AI-Driven Faculty and Room Scheduling System, PostgreSQL database (source: `prisma/schema.prisma`).

Conventions: every `id` is a generated text key (cuid). `createdAt` and `updatedAt` are timestamps set automatically. Times of day are stored as minutes from midnight. Enumerated types are listed in brackets.

## Table 1. User

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier of the account | Primary key |
| email | Text | Sign-in email | Unique, not null |
| passwordHash | Text | Hashed password | Not null |
| name | Text | Full name of the account holder | Not null |
| role | Enum | Super Administrator, Registrar, Head of Department, Faculty, Student | Not null |
| status | Enum | Pending, Active, Inactive, Suspended | Not null, default Active |
| emailVerified | Timestamp | When the email was verified | Nullable |
| failedLoginAttempts | Integer | Consecutive failed sign-ins | Not null, default 0 |
| lockedUntil | Timestamp | Lockout end time | Nullable |
| lastLoginAt | Timestamp | Most recent sign-in | Nullable |
| sessionVersion | Integer | Raised to sign out every device | Not null, default 0 |
| twoFactorEnabled | Boolean | Two-factor authentication switch | Not null, default false |
| twoFactorSecret | Text | Encrypted authenticator secret | Nullable |
| facultyId | Text | Linked faculty record | Foreign key to Faculty, unique, nullable |
| archivedAt | Timestamp | When the account was archived | Nullable |
| createdAt | Timestamp | Record creation time | Not null, default now |
| updatedAt | Timestamp | Last change time | Not null |

## Table 2. AuthToken

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| userId | Text | Owner of the token | Foreign key to User, not null, cascade delete |
| type | Enum | Email verification or password reset | Not null |
| tokenHash | Text | Hash of the single-use token | Unique, not null |
| expiresAt | Timestamp | Expiry time | Not null |
| usedAt | Timestamp | When the token was used | Nullable |
| createdAt | Timestamp | Record creation time | Not null, default now |

## Table 3. Department

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| code | Text | Department code | Unique, not null |
| name | Text | Department name | Not null |
| logoUrl | Text | Department logo location | Nullable |
| createdAt | Timestamp | Record creation time | Not null, default now |
| updatedAt | Timestamp | Last change time | Not null |

## Table 4. Program

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| code | Text | College course or Senior High School strand code | Unique, not null |
| name | Text | Program name | Not null |
| level | Enum | Academic level | Not null, default College |
| sortOrder | Integer | Display order | Not null, default 0 |
| departmentId | Text | Owning department | Foreign key to Department, nullable |

## Table 5. AcademicYear

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| name | Text | Label such as 2026-2027 | Unique, not null |
| startDate | Timestamp | First day of the year | Not null |
| endDate | Timestamp | Last day of the year | Not null |
| isActive | Boolean | Current academic year | Not null, default false |

## Table 6. Semester

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| academicYearId | Text | Parent academic year | Foreign key to AcademicYear, not null |
| level | Enum | Academic level of the term | Not null, default College |
| programId | Text | College course the term belongs to; empty means every course | Foreign key to Program, nullable |
| type | Enum | First, Second, Summer, Quarter 1 to Quarter 4 | Not null |
| name | Text | Term name | Not null |
| startDate | Timestamp | Term start | Not null |
| endDate | Timestamp | Term end | Not null |
| isActive | Boolean | Current term | Not null, default false |

## Table 7. Subject

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| code | Text | Subject code | Unique, not null |
| name | Text | Subject title | Not null |
| description | Text | Short description | Nullable |
| units | Decimal | Credit units | Not null |
| lectureHours | Decimal | Lecture hours per week | Not null, default 0 |
| labHours | Decimal | Laboratory hours per week | Not null, default 0 |
| requiredRoomType | Enum | Room type the subject needs | Not null, default Lecture Room |
| level | Enum | Academic level | Not null, default College |
| yearLevel | Enum | College year level | Nullable |
| gradeLevel | Enum | Basic education grade level | Nullable |
| category | Enum | Major or Minor | Not null, default Major |
| semester | Enum | Curriculum term | Nullable |
| programId | Text | Owning program | Foreign key to Program, nullable |
| departmentId | Text | Owning department; empty means the subject belongs to the shared catalog | Foreign key to Department, nullable |
| archivedAt | Timestamp | When the subject was archived | Nullable |

## Table 8. Section

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| name | Text | Section name | Not null |
| level | Enum | Academic level | Not null, default College |
| yearLevel | Enum | College year level | Nullable |
| gradeLevel | Enum | Basic education grade level | Nullable |
| studentCount | Integer | Number of enrolled students | Not null, default 0 |
| programId | Text | Course or strand | Foreign key to Program, nullable |
| departmentId | Text | Owning department | Foreign key to Department, nullable |
| semesterId | Text | Term of the section | Foreign key to Semester, nullable |
| archivedAt | Timestamp | When the section was archived | Nullable |

Unique together: name and semesterId.

## Table 9. Faculty

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| employeeId | Text | Employee number | Unique, not null |
| fullName | Text | Full name | Not null |
| email | Text | Email address | Unique, not null |
| position | Text | Job position | Nullable |
| specialization | Text | Field of expertise | Nullable |
| maxHours | Integer | Maximum teaching hours per week | Not null, default 24 |
| employmentType | Enum | Full-time or Part-time | Not null, default Full-time |
| dayOff | Enum | Weekly day off for part-time faculty | Nullable |
| status | Enum | Active, Inactive, On Leave | Not null, default Active |
| teachingLevels | Enum list | Academic levels the member teaches | Not null, default College |
| departmentId | Text | Home department | Foreign key to Department, nullable |
| archivedAt | Timestamp | When the record was archived | Nullable |

## Table 10. FacultyAvailability

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| facultyId | Text | Faculty member | Foreign key to Faculty, not null, cascade delete |
| dayOfWeek | Enum | Day of the week | Not null |
| startMin | Integer | Start time in minutes from midnight | Not null |
| endMin | Integer | End time in minutes from midnight | Not null |

## Table 11. Student

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| studentNumber | Text | Learner reference number or college student number | Unique, not null |
| userId | Text | Linked account | Foreign key to User, unique, not null, cascade delete |
| sectionId | Text | Enrolled section | Foreign key to Section, nullable, set null on delete |

## Table 12. Building

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| name | Text | Building name | Unique, not null |
| code | Text | Building code | Nullable |
| location | Text | Place on campus | Nullable |
| purpose | Enum | Academic, Science and Technology, Library, Arts, Sports, Administration, Mixed Use | Not null, default Academic |
| openingMin | Integer | Opening time in minutes from midnight | Nullable |
| closingMin | Integer | Closing time in minutes from midnight | Nullable |
| photo | Binary | Building photo | Nullable |

## Table 13. Floor

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| buildingId | Text | Parent building | Foreign key to Building, not null, cascade delete |
| name | Text | Floor name | Not null |
| number | Integer | Floor number for ordering | Not null, default 1 |

Unique together: buildingId and name.

## Table 14. Room

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| roomNumber | Text | Room number | Unique, not null |
| roomName | Text | Room name | Not null |
| floorId | Text | Floor of the room | Foreign key to Floor, nullable |
| capacity | Integer | Number of seats | Not null |
| roomType | Enum | Lecture Room, Computer Laboratory, Science Laboratory, Conference Room, Other | Not null |
| equipment | Text list | Installed equipment | Not null |
| status | Enum | Available, Under Maintenance, Unavailable | Not null, default Available |
| departmentId | Text | Owning department; empty means shared | Foreign key to Department, nullable |
| isGeneralShared | Boolean | Usable by every program | Not null, default true |
| archivedAt | Timestamp | When the room was archived | Nullable |

## Table 15. Schedule

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| semesterId | Text | Term | Foreign key to Semester, not null |
| subjectId | Text | Subject taught | Foreign key to Subject, not null |
| sectionId | Text | Section attending | Foreign key to Section, not null |
| facultyId | Text | Assigned faculty member | Foreign key to Faculty, not null |
| roomId | Text | Assigned room | Foreign key to Room, not null |
| component | Enum | Lecture or Laboratory | Not null |
| dayOfWeek | Enum | Meeting day | Not null |
| startMin | Integer | Start time in minutes from midnight | Not null |
| endMin | Integer | End time in minutes from midnight | Not null |
| status | Enum | Draft, Review, Published, Archived | Not null, default Draft |
| version | Integer | Revision number | Not null, default 1 |
| generatedBy | Text | AI engine or the user who made it | Nullable |
| score | Decimal | Quality score of the placement | Nullable |
| doNotMove | Boolean | Protects the class from automatic moves | Not null, default false |
| departmentId | Text | Owning department snapshot | Nullable |
| submissionId | Text | Timetable submission it was sent in | Foreign key to TimetableSubmission, nullable |

No two active classes may share a room, faculty member, or section at the same day and time.

## Table 16. SubjectAssignment

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| subjectId | Text | Subject | Foreign key to Subject, not null |
| facultyId | Text | Faculty member who teaches it | Foreign key to Faculty, not null |
| sectionId | Text | Section; empty means every section | Foreign key to Section, nullable |
| semesterId | Text | Term | Foreign key to Semester, not null |
| status | Enum | Active or Archived | Not null, default Active |
| assignedById | Text | User who made the assignment | Nullable |

Only one active assignment per subject, section, and term.

## SubjectAssignmentProposal

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| subjectId | Text | Proposed subject | Foreign key to Subject, not null |
| facultyId | Text | Proposed faculty member | Foreign key to Faculty, not null |
| sectionId | Text | Specific section | Foreign key to Section, not null |
| semesterId | Text | Term | Foreign key to Semester, not null |
| reviewDepartmentId | Text | Proposed faculty member's home department | Foreign key to Department, not null |
| requestedById | Text | Submitting Head of Department | Foreign key to User, not null |
| reviewedById | Text | Reviewer | Foreign key to User, nullable |
| status | Enum | Pending, Approved, Rejected | Not null, default Pending |
| decisionNote | Text | Approval or rejection note | Nullable |
| decidedAt | Timestamp | Decision time | Nullable |

Only one pending proposal is allowed per subject, section, and term. Approval creates or replaces the active SubjectAssignment; rejection leaves it unchanged.

## Table 17. TimetableSubmission

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| departmentId | Text | Submitting department | Foreign key to Department, not null |
| semesterId | Text | Term | Foreign key to Semester, not null |
| kind | Enum | Class or Examination | Not null, default Class |
| examType | Enum | Examination period | Nullable |
| version | Integer | Submission version | Not null |
| status | Enum | Submitted, Approved, Published, Returned, Rejected, Withdrawn | Not null, default Submitted |
| publishAt | Timestamp | Planned go-live time | Nullable |
| snapshot | JSON | Rows as submitted | Nullable |
| classCount | Integer | Number of rows submitted | Not null |
| submittedById | Text | Head of Department who submitted | Foreign key to User, not null |
| submittedAt | Timestamp | Submission time | Not null, default now |
| decidedById | Text | Registrar who decided | Foreign key to User, nullable |
| decidedAt | Timestamp | Decision time | Nullable |
| reason | Text | Reason for return or rejection | Nullable |

## Table 18. Examination

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| semesterId | Text | Term | Foreign key to Semester, not null |
| subjectId | Text | Subject examined | Foreign key to Subject, not null |
| sectionId | Text | Section taking it | Foreign key to Section, not null |
| roomId | Text | Examination room | Foreign key to Room, not null |
| proctorId | Text | Proctor | Foreign key to Faculty, not null |
| type | Enum | Preliminary, Midterm, Semi-Final, Final, Special | Not null, default Midterm |
| date | Date | Examination date | Not null |
| startMin | Integer | Start time in minutes from midnight | Not null |
| endMin | Integer | End time in minutes from midnight | Not null |
| status | Enum | Draft, Review, Published, Archived | Not null, default Draft |
| reviewNote | Text | Reason for rejection or requested changes | Nullable |
| batchId | Text | Auto-scheduler run that created it | Foreign key to ExamBatch, nullable |
| submissionId | Text | Timetable submission it was sent in | Foreign key to TimetableSubmission, nullable |

## Table 19. Activity

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| type | Enum | School Event, Holiday, Class Suspension, Examination Week | Not null |
| title | Text | Activity title | Not null |
| description | Text | Details | Nullable |
| startDate | Date | First day | Not null |
| endDate | Date | Last day | Not null |
| startMin | Integer | Start time; empty means all day | Nullable |
| endMin | Integer | End time; empty means all day | Nullable |
| sectionIds | Text list | Affected sections for suspensions | Not null |
| departmentId | Text | Submitting department; empty means institution-wide | Foreign key to Department, nullable |
| level | Enum | Academic level; empty means every level | Nullable |
| roomId | Text | Room used | Foreign key to Room, nullable |
| status | Enum | Pending, Approved, Rejected, Changes Requested | Not null, default Approved |
| reviewNote | Text | Reason for rejection or requested changes | Nullable |

## Table 20. RoomBooking

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| roomId | Text | Booked room | Foreign key to Room, not null |
| bookedById | Text | User who booked | Foreign key to User, not null |
| purpose | Text | Reason for the booking | Not null |
| date | Date | Booking date | Not null |
| startMin | Integer | Start time in minutes from midnight | Not null |
| endMin | Integer | End time in minutes from midnight | Not null |
| attendees | Integer | Expected number of attendees | Not null |
| status | Enum | Pending, Confirmed, Awaiting Approval, Rejected, Cancelled, Completed, No Show | Not null, default Confirmed |
| priority | Enum | Regular, High, Urgent, Critical | Not null, default Regular |
| urgentReason | Enum | Reason for an urgent booking | Nullable |
| departmentId | Text | Requester department | Nullable |
| batchId | Text | Adjustment run that moved classes for it | Foreign key to AdjustmentBatch, unique, nullable |
| displacedById | Text | Higher-priority booking that took the room | Foreign key to RoomBooking, nullable |

## Table 21. Unavailability

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| kind | Enum | Faculty or Room | Not null |
| facultyId | Text | Unavailable faculty member | Foreign key to Faculty, nullable, cascade delete |
| roomId | Text | Unavailable room | Foreign key to Room, nullable, cascade delete |
| startDate | Date | First day | Not null |
| endDate | Date | Last day | Not null |
| startMin | Integer | Start time; empty means all day | Nullable |
| endMin | Integer | End time; empty means all day | Nullable |
| reason | Text | Reason for unavailability | Not null |
| status | Enum | Pending, Applied, Dismissed | Not null, default Pending |
| batchId | Text | Adjustment run it triggered | Foreign key to AdjustmentBatch, unique, nullable |

## Table 22. ClassSuspension

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| title | Text | Order title | Not null |
| reason | Text | Reason for the suspension | Not null |
| startDate | Date | First day | Not null |
| endDate | Date | Last day | Not null |
| startMin | Integer | Start time; empty means whole days | Nullable |
| endMin | Integer | End time; empty means whole days | Nullable |
| sectionIds | Text list | Affected sections; empty means all in scope | Not null |
| level | Enum | Academic level of the order | Nullable |
| departmentId | Text | Issuing department; empty means school-wide | Foreign key to Department, nullable |
| status | Enum | Active or Lifted | Not null, default Active |
| issuedById | Text | Issuing user | Foreign key to User, not null |
| issuedRole | Enum | Role of the issuer at the time | Not null |
| liftedById | Text | User who lifted the order | Foreign key to User, nullable |
| batchId | Text | Adjustment run it triggered | Foreign key to AdjustmentBatch, unique, nullable |

## Table 23. AdjustmentBatch

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| cause | Enum | Room Booking, Faculty Unavailable, Room Unavailable, Class Suspension | Not null |
| summary | Text | What the run changed | Not null |
| createdById | Text | User who triggered it | Nullable |
| undoneAt | Timestamp | When the run was undone | Nullable |
| departmentId | Text | Affected department | Nullable |
| createdAt | Timestamp | Record creation time | Not null, default now |

## Table 24. ScheduleAdjustment

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| batchId | Text | Parent adjustment run | Foreign key to AdjustmentBatch, not null, cascade delete |
| scheduleId | Text | Class that was changed | Foreign key to Schedule, not null, cascade delete |
| kind | Enum | Moved, Cancelled, Make-Up, Online | Not null |
| date | Date | Regular meeting date replaced | Not null |
| newDate | Date | New date for make-up classes | Nullable |
| roomId | Text | New room; empty keeps the original | Nullable |
| facultyId | Text | New faculty member; empty keeps the original | Nullable |
| startMin | Integer | New start time | Nullable |
| endMin | Integer | New end time | Nullable |
| reason | Text | Why the class changed | Not null |

## Table 25. WorkloadProposal

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| kind | Enum | Workload or Schedule Repair | Not null, default Workload |
| semesterId | Text | Term | Not null |
| departmentId | Text | Department in scope | Nullable |
| status | Enum | Pending, Applied, Rejected, Superseded | Not null, default Pending |
| automatic | Boolean | Created by the continuous workload check | Not null, default false |
| items | JSON | Suggested moves from the optimizer | Not null |
| explanation | Text | Why the moves were suggested | Not null |
| createdById | Text | Requesting user | Not null |
| reviewedById | Text | Approving user | Nullable |
| reviewedAt | Timestamp | Review time | Nullable |
| undoneAt | Timestamp | When the proposal was undone | Nullable |
| version | Integer | Raised on each review to block double approval | Not null, default 1 |

## Table 26. ScheduleRequest

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| type | Enum | New Schedule, Change Time, Change Room, Change Faculty, Cancel Schedule, Cross-Department, Faculty Change, Subject Change | Not null |
| status | Enum | Pending, Approved, Rejected, Completed, Cancelled | Not null, default Pending |
| scheduleId | Text | Class concerned | Foreign key to Schedule, nullable |
| requestedById | Text | Requesting user | Foreign key to User, not null |
| reviewedById | Text | Reviewing user | Foreign key to User, nullable |
| details | JSON | Requested change | Not null |
| reason | Text | Reason for the request | Nullable |
| reviewNote | Text | Reviewer comment | Nullable |
| targetDepartmentId | Text | Department that may approve | Nullable |
| departmentId | Text | Requesting department | Nullable |

## Table 27. Notification

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| userId | Text | Recipient | Foreign key to User, not null, cascade delete |
| type | Enum | Info, Success, Warning, Error | Not null, default Info |
| title | Text | Short heading | Not null |
| message | Text | Notification body | Not null |
| isRead | Boolean | Read state | Not null, default false |
| link | Text | Page to open | Nullable |
| createdAt | Timestamp | Record creation time | Not null, default now |

## Table 28. AuditLog

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| userId | Text | User who acted | Foreign key to User, nullable |
| action | Text | Action performed | Not null |
| entity | Text | Record type affected | Not null |
| entityId | Text | Record affected | Nullable |
| oldValue | JSON | Value before the change | Nullable |
| newValue | JSON | Value after the change | Nullable |
| ipAddress | Text | Source address | Nullable |
| role | Text | Role of the user at the time | Nullable |
| departmentId | Text | Department in scope | Nullable |
| reason | Text | Stated reason | Nullable |
| createdAt | Timestamp | Record creation time | Not null, default now |

## Table 29. SystemSetting

| Field Name | Data Type | Description | Constraints |
|---|---|---|---|
| id | Text | Unique identifier | Primary key |
| key | Text | Setting name | Unique, not null |
| value | JSON | Setting value | Not null |
| updatedAt | Timestamp | Last change time | Not null |

## Supporting tables not detailed above

TimeSlot, RoomAvailability, FacultyRoomPreference, SectionClassPlaceholder, UserDepartmentAssignment, HeadProgramAssignment, SubjectChangeRequest, TimetableComment, SchedulingConstraint, ExamBatch, ActivityProposal, ActivityProposalRow, BookingAcknowledgement, WorkloadProposalItem, WorkloadFix, UserSession, LoginAttempt, AIConversation, AIMessage, DailyStat.
