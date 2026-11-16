---
type: "query"
date: "2026-11-14T12:44:56.579264+00:00"
question: "Why are subjects not multiplied per section, and what is the recommended design?"
contributor: "graphify"
source_nodes: ["projectedLoads", "loadWorkload", "assignedFor"]
---

# Q: Why are subjects not multiplied per section, and what is the recommended design?

## Answer

Use one subject catalog entry and separate class offerings keyed by term, section and subject. CC101 at 3 weekly hours across 8 separate sections creates 8 offerings and 24 weekly teaching hours when assigned to one faculty member. Replace All sections as a nullable default assignment with Select all matching sections as a bulk selection of explicit assignments. projectedLoads in lib/subjects/plan.ts currently deduplicates faculty per subject, undercounting multiple section assignments. lib/workload/load.ts counts one curriculum load for an all-sections assignment and skips it after any matching schedule exists, hiding remaining section demand. Centralize per-offering planned and scheduled load accounting; keep scheduled hours plus remaining required hours from double counting; show per-section teacher and progress and live projected load before saving. Expand existing global assignments against eligible current-term curriculum sections, preserve section overrides, and validate the same scope on the server.

## Source Nodes

- projectedLoads
- loadWorkload
- assignedFor