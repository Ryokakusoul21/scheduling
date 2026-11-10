import type { Assignment } from "@/lib/workload/optimizer";

type DepartmentInput = { id: string; code: string; name: string };
type FacultyInput = { id: string; departmentId: string | null; maxCapacity: number };
type WorkloadMeasure = "HOURS" | "UNITS";

export interface DepartmentStaffingRow extends DepartmentInput {
  measure: WorkloadMeasure;
  activeFaculty: number;
  capacity: number;
  assignedLoad: number;
  demandLoad: number;
  utilization: number | null;
  availableCapacity: number;
  additionalCapacityNeeded: number;
  facultyCapacityEquivalent: number | null;
  overloadedFaculty: number;
  overload: number;
  unassignedClasses: number;
  unassignedLoad: number;
  recommendationLevel: "URGENT" | "HIGH" | "REASSIGN" | "REBALANCE" | "MONITOR" | "NONE";
  recommendedAction: string;
}

function assignmentLoad(assignment: Assignment, measure: WorkloadMeasure) {
  if (measure === "UNITS") return assignment.subjectUnits;
  return assignment.meetings.length
    ? assignment.meetings.reduce((total, meeting) => total + meeting.endMin - meeting.startMin, 0) / 60
    : assignment.plannedHours ?? 0;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export function summarizeDepartmentStaffing(
  departments: DepartmentInput[],
  faculty: FacultyInput[],
  assignments: Assignment[],
  unassigned: Assignment[],
  measure: WorkloadMeasure = "HOURS",
): DepartmentStaffingRow[] {
  const loadByFaculty = new Map<string, number>();
  const unassignedByDepartment = new Map<string, { count: number; load: number }>();

  for (const assignment of assignments) {
    loadByFaculty.set(assignment.facultyId, (loadByFaculty.get(assignment.facultyId) ?? 0) + assignmentLoad(assignment, measure));
  }
  for (const assignment of unassigned) {
    if (!assignment.departmentId) continue;
    const current = unassignedByDepartment.get(assignment.departmentId) ?? { count: 0, load: 0 };
    current.count += 1;
    current.load += assignmentLoad(assignment, measure);
    unassignedByDepartment.set(assignment.departmentId, current);
  }

  return departments.map((department) => {
    const members = faculty.filter((person) => person.departmentId === department.id);
    let capacity = 0;
    let assignedLoad = 0;
    let overloadedFaculty = 0;
    let overload = 0;

    for (const person of members) {
      const load = loadByFaculty.get(person.id) ?? 0;
      capacity += person.maxCapacity;
      assignedLoad += load;
      if (load > person.maxCapacity) {
        overloadedFaculty += 1;
        overload += load - person.maxCapacity;
      }
    }

    const unfilled = unassignedByDepartment.get(department.id) ?? { count: 0, load: 0 };
    const demandLoad = assignedLoad + unfilled.load;
    const additionalCapacityNeeded = Math.max(0, demandLoad - capacity);
    const availableCapacity = Math.max(0, capacity - demandLoad);
    const utilization = capacity ? Math.round((demandLoad / capacity) * 100) : null;
    const facultyCapacityEquivalent = additionalCapacityNeeded && members.length && capacity
      ? round1(additionalCapacityNeeded / (capacity / members.length))
      : null;
    const unit = measure === "HOURS" ? "weekly hours" : "teaching units";
    let recommendationLevel: DepartmentStaffingRow["recommendationLevel"];
    let recommendedAction: string;

    if (additionalCapacityNeeded > 0) {
      recommendationLevel = members.length ? "HIGH" : "URGENT";
      const estimate = facultyCapacityEquivalent === null
        ? " A faculty-equivalent estimate is unavailable because the department has no active-faculty capacity baseline."
        : ` This is approximately ${facultyCapacityEquivalent} faculty capacity equivalents at the department average, not a headcount target.`;
      const coverage = unfilled.count
        ? ` Prioritize coverage for ${unfilled.count} unassigned ${unfilled.count === 1 ? "class" : "classes"}.`
        : "";
      const rebalance = overloadedFaculty
        ? ` Also rebalance ${round1(overload)} ${unit} from ${overloadedFaculty} overloaded ${overloadedFaculty === 1 ? "faculty member" : "faculty members"} where qualifications and schedules permit.`
        : "";
      recommendedAction = `Secure at least ${round1(additionalCapacityNeeded)} additional ${unit}.${coverage}${rebalance}${estimate}`;
    } else if (unfilled.count > 0) {
      recommendationLevel = "REASSIGN";
      recommendedAction = `Assign the ${unfilled.count} unassigned ${unfilled.count === 1 ? "class" : "classes"} to qualified faculty; ${round1(availableCapacity)} ${unit} remain in aggregate capacity. Check individual availability and limits before reassignment.`;
    } else if (overloadedFaculty > 0) {
      recommendationLevel = "REBALANCE";
      recommendedAction = `Rebalance ${round1(overload)} ${unit} from ${overloadedFaculty} overloaded ${overloadedFaculty === 1 ? "faculty member" : "faculty members"}; active-term demand fits aggregate capacity.`;
    } else if (utilization !== null && utilization >= 85) {
      recommendationLevel = "MONITOR";
      recommendedAction = `Protect the remaining ${round1(availableCapacity)} ${unit}; review capacity before adding teaching assignments.`;
    } else {
      recommendationLevel = "NONE";
      recommendedAction = `No shortage is indicated by active-term demand; ${round1(availableCapacity)} ${unit} of aggregate capacity remain.`;
    }

    return {
      ...department,
      measure,
      activeFaculty: members.length,
      capacity: round1(capacity),
      assignedLoad: round1(assignedLoad),
      demandLoad: round1(demandLoad),
      utilization,
      availableCapacity: round1(availableCapacity),
      additionalCapacityNeeded: round1(additionalCapacityNeeded),
      facultyCapacityEquivalent,
      overloadedFaculty,
      overload: round1(overload),
      unassignedClasses: unfilled.count,
      unassignedLoad: round1(unfilled.load),
      recommendationLevel,
      recommendedAction,
    };
  });
}
