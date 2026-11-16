---
type: "query"
date: "2026-11-14T13:39:18.130624+00:00"
question: "The auto-schedule doesnt work, the data assign doesnt connect to unschedule. What is the strongest recommendation?"
contributor: "graphify"
source_nodes: ["sectionNeeds", "saveAssignmentPlanAction", "buildResolverInput", "facultyFor"]
---

# Q: The auto-schedule doesnt work, the data assign doesnt connect to unschedule. What is the strongest recommendation?

## Answer

A read-only database check confirmed BSIT CC101 sections 1-C through 1-H have active section-specific faculty assignments, 3 required weekly hours each, but zero SectionClassPlaceholder rows for CC101. Their 18 required hours are invisible to sectionNeeds because it filters remainingNeeds against section.curriculum. saveAssignmentPlanAction writes SubjectAssignment but does not synchronize curriculum placeholders. Recommend a shared term-section-subject-component offering service: atomically synchronize validated approved curriculum components when assignments are saved or approved; backfill existing missing components; derive remaining hours from saved meetings; keep unassigned required classes visible as blocked. Auto-scheduling and resolver inputs must carry and enforce the explicit faculty assignment. buildResolverInput currently omits assignments; facultyFor infers teachers from existing meetings, and serverInput supplies empty curriculum. Unify scheduling around a global working state, explicit section/filter scope, draft preview and transactional server validation; return per-offering failure reasons and ensure Subjects, Unscheduled, workload and exported sheets derive progress from the same persisted meetings. Preserve published schedules and section-specific teacher overrides. Acceptance checks: assignment appears immediately in queue, partial placement reduces remaining hours only, full placement clears it, and repeated auto-scheduling creates no duplicates.

## Source Nodes

- sectionNeeds
- saveAssignmentPlanAction
- buildResolverInput
- facultyFor