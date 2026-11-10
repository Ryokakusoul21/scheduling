import { describe, expect, it } from "vitest";
import { parseDelimited, rowsToRecords } from "@/lib/import/parse";
import { ROOM_COLUMNS, SUBJECT_COLUMNS, templateCsv, validateRooms, validateSubjects } from "@/lib/import/specs";

describe("parseDelimited", () => {
  it("handles quotes, embedded commas, and CRLF", () => {
    expect(parseDelimited('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([["a", "b"], ["x, y", 'say "hi"']]);
  });
  it("detects tab-separated text pasted from a spreadsheet", () => {
    expect(parseDelimited("Code\tName\nIT1\tOne")).toEqual([["Code", "Name"], ["IT1", "One"]]);
  });
});

describe("rowsToRecords", () => {
  it("matches headers loosely and reports missing columns", () => {
    const { records, missing } = rowsToRecords([["CODE", "name"], ["IT1", "One"]], SUBJECT_COLUMNS.slice(0, 3));
    expect(records[0]).toMatchObject({ code: "IT1", name: "One", units: "" });
    expect(missing).toEqual(["Units"]);
  });
});

describe("validateSubjects", () => {
  const lookups = { programs: [{ code: "BSIT", level: "COLLEGE" }], existingCodes: ["IT101"] };
  const row = { code: "IT204", name: "Object-Oriented Programming", units: "3", lectureHours: "2", labHours: "1", roomType: "Computer laboratory", level: "College", program: "BSIT", yearLevel: "Second", gradeLevel: "", description: "" };

  it.each(["Nursery", "Preparatory", "Kindergarten"])("imports %s under Pre-elementary", (gradeLevel) => {
    const [result] = validateSubjects([{ ...row, level: "Pre-elementary", gradeLevel, program: "", yearLevel: "" }], lookups);
    expect(result.errors).toEqual([]);
    expect(result.data?.level).toBe("PRE_ELEMENTARY");
  });

  it("accepts SHS core subjects and rejects Kindergarten under Elementary", () => {
    const results = validateSubjects([
      { ...row, code: "OLD", level: "Senior High School", gradeLevel: "Grade 11", program: "", yearLevel: "" },
      { ...row, code: "KINDER", level: "Elementary", gradeLevel: "Kindergarten", program: "", yearLevel: "" },
    ], lookups);
    expect(results[0].data).toMatchObject({ level: "SENIOR_HIGH", gradeLevel: "GRADE_11", programCode: null });
    expect(results[1].errors.join()).toMatch(/not part of/);
  });

  it.each(["STEM", "ABM", "HUMSS", "GAS", "ICT", "TVL"])("imports Grade 12 subjects in the %s strand", (program) => {
    const [result] = validateSubjects([{ ...row, level: "Senior High School", gradeLevel: "Grade 12", program, yearLevel: "" }], {
      ...lookups, programs: [{ code: program, level: "SENIOR_HIGH" }],
    });
    expect(result.errors).toEqual([]);
    expect(result.data).toMatchObject({ level: "SENIOR_HIGH", gradeLevel: "GRADE_12", programCode: program });
  });

  it("accepts a valid row with human-readable values", () => {
    const [r] = validateSubjects([row], lookups);
    expect(r.errors).toEqual([]);
    expect(r.data).toMatchObject({ requiredRoomType: "COMPUTER_LABORATORY", level: "COLLEGE", yearLevel: "SECOND", programCode: "BSIT" });
  });

  it("rejects duplicates, unknown programs, and mismatched grades", () => {
    const results = validateSubjects(
      [{ ...row, code: "IT101" }, { ...row, program: "XYZ" }, { ...row, code: "IT204" }, { ...row, code: "M7", level: "Junior High School", program: "", yearLevel: "", gradeLevel: "Grade 6" }],
      lookups
    );
    expect(results[0].errors[0]).toMatch(/already exists/);
    expect(results[1].errors.join()).toMatch(/does not exist/);
    expect(results[2].errors.join()).toMatch(/more than once/);
    expect(results[3].errors.join()).toMatch(/not part of/);
  });
});

describe("validateRooms", () => {
  it("validates capacity and departments and warns about new floors", () => {
    const lookups = { existingNumbers: ["101"], departments: [{ id: "d1", code: "CCS", name: "College of Computer Studies" }], floors: [{ building: "Main Building", floor: "Ground Floor" }] };
    const base = { roomNumber: "1204", roomName: "Laboratory", building: "Main Building", floor: "Ground Floor", capacity: "40", roomType: "Computer laboratory", equipment: "Computers; Projector", department: "college of computer studies" };
    const [ok, bad, created] = validateRooms([base, { ...base, roomNumber: "101", capacity: "0" }, { ...base, roomNumber: "9", floor: "Roof" }], lookups);
    expect(ok.data).toMatchObject({ departmentId: "d1", equipment: ["Computers", "Projector"], capacity: 40 });
    expect(bad.errors.length).toBe(2);
    expect(created.warnings[0]).toMatch(/will be created/);
  });

  it("builds a template with every column", () => {
    expect(templateCsv("rooms").split("\r\n")[0].split(",")).toHaveLength(ROOM_COLUMNS.length);
  });
});
