/** A room's owning department is also its scheduling designation. */
export interface RoomDesignation {
  departmentId?: string | null;
  departmentCode?: string | null;
  isGeneralShared?: boolean;
  /** Legacy program restrictions, used only when department data is absent. */
  programIds?: string[] | null;
}

export interface SectionDesignation {
  departmentId?: string | null;
  level?: string | null;
  programId?: string | null;
}

const SCHOOL_LEVELS: Record<string, string> = {
  SHS: "SENIOR_HIGH",
  JHS: "JUNIOR_HIGH",
  ELEM: "ELEMENTARY",
  "PRE-ELEM": "PRE_ELEMENTARY",
};

export function roomAllowsSection(room: RoomDesignation, section: SectionDesignation) {
  if (room.departmentId === null) return room.isGeneralShared ?? room.programIds == null;
  if (room.departmentId) {
    const level = SCHOOL_LEVELS[room.departmentCode ?? ""];
    // Older basic-education sections still belong to BED; their level identifies
    // the individual school department without rewriting historical ownership.
    if (level) return section.level === level;
    if (room.departmentCode === "BED") return !!section.level && section.level !== "COLLEGE";
    return room.departmentId === section.departmentId;
  }
  return !room.programIds || !!section.programId && room.programIds.includes(section.programId);
}
