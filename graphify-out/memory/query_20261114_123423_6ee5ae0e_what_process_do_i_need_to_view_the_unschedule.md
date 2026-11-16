---
type: "query"
date: "2026-11-14T12:34:23.456649+00:00"
question: "what process do i need to view the unschedule"
contributor: "graphify"
source_nodes: ["sectionNeeds", "remainingNeeds", "SectionNeedsSummary"]
---

# Q: what process do i need to view the unschedule

## Answer

For College, prepare subjects with weekly lecture or lab hours, then use Sections > Auto-generate sections for the matching program, year and term with Link curriculum classes to each section enabled. Open Scheduler in Classes mode with the matching academic year and term and academic filters, then expand Unscheduled and select a section. The current implementation passes section classPlaceholders as curriculum to remainingNeeds, so a manually added section with no placeholders yields zero needs even when subjects exist. The empty panel message can therefore also mean no linked curriculum or no matching sections.

## Source Nodes

- sectionNeeds
- remainingNeeds
- SectionNeedsSummary