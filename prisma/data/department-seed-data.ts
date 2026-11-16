/** Fictional sample data for every non-computing department that has its own rooms. */
import type { AcademicLevel, GradeLevel, YearLevel } from "@prisma/client";

export type DeptSubject = { code: string; name: string; program?: string; year?: YearLevel; grade?: GradeLevel };
export type DeptSection = { name: string; program?: string; year?: YearLevel; grade?: GradeLevel; students: number; subjects: string[] };
export type DeptPlan = {
  code: string;
  level: AcademicLevel;
  head: { email: string; employeeId: string };
  /** Existing faculty records moved into this department. */
  moveFaculty?: string[];
  newFaculty: number;
  subjects: DeptSubject[];
  sections: DeptSection[];
};

const s = (code: string, name: string, program: string, year: YearLevel): DeptSubject => ({ code, name, program, year });
const GE: Record<YearLevel, string[]> = { FIRST: ["GE101", "GE103"], SECOND: ["GE5", "GE7"], THIRD: ["GE6"], FOURTH: [], FIFTH: [] };
const YEAR_NUM: Record<YearLevel, number> = { FIRST: 1, SECOND: 2, THIRD: 3, FOURTH: 4, FIFTH: 5 };

/** College section taking its program's majors for the year plus that year's General Education subjects. */
function college(program: string, label: string, year: YearLevel, letter: string, students: number, subjects: DeptSubject[]): DeptSection {
  const majors = subjects.filter((x) => x.program === program && x.year === year).map((x) => x.code);
  return { name: `${label} ${YEAR_NUM[year]}-${letter}`, program, year, students, subjects: [...majors, ...GE[year]] };
}

const CCJE_SUBJECTS = [
  s("CRIM101", "Introduction to Criminology", "BSCRIM", "FIRST"),
  s("CRIM102", "Theories of Crime Causation", "BSCRIM", "FIRST"),
  s("CRIM103", "Introduction to Philippine Criminal Justice System", "BSCRIM", "FIRST"),
  s("CRIM201", "Law Enforcement Organization and Administration", "BSCRIM", "SECOND"),
  s("CRIM202", "Forensic Photography", "BSCRIM", "SECOND"),
  s("CRIM203", "Human Behavior and Crisis Management", "BSCRIM", "SECOND"),
  s("CRIM301", "Criminal Law Book One", "BSCRIM", "THIRD"),
  s("CRIM302", "Fundamentals of Criminal Investigation", "BSCRIM", "THIRD"),
  s("CRIM303", "Juvenile Delinquency and Juvenile Justice System", "BSCRIM", "THIRD"),
  s("CRIM401", "Criminal Law Book Two", "BSCRIM", "FOURTH"),
  s("CRIM402", "Evidence", "BSCRIM", "FOURTH"),
  s("CRIM403", "Criminological Research 1", "BSCRIM", "FOURTH"),
  s("ISM101", "Introduction to Industrial Security Management", "BSISM", "FIRST"),
  s("ISM102", "Industrial Security Concepts", "BSISM", "FIRST"),
  s("ISM103", "Security Laws and Regulations", "BSISM", "FIRST"),
  s("ISM201", "Security Survey and Inspection", "BSISM", "SECOND"),
  s("ISM202", "Risk Management", "BSISM", "SECOND"),
  s("ISM203", "Investigation and Intelligence for Security", "BSISM", "SECOND"),
];

const CBA_SUBJECTS = [
  s("ACC101", "Fundamentals of Accounting", "BSA", "FIRST"),
  s("ACC102", "Financial Accounting and Reporting", "BSA", "FIRST"),
  s("ACC103", "Managerial Economics", "BSA", "FIRST"),
  s("ACC201", "Intermediate Accounting 1", "BSA", "SECOND"),
  s("ACC202", "Cost Accounting and Control", "BSA", "SECOND"),
  s("ACC203", "Business Law and Regulations", "BSA", "SECOND"),
  s("BA101", "Principles of Business Administration", "BSBA", "FIRST"),
  s("BA102", "Basic Microeconomics", "BSBA", "FIRST"),
  s("BA103", "Principles of Management", "BSBA", "FIRST"),
  s("BA201", "Marketing Management", "BSBA", "SECOND"),
  s("BA202", "Human Resource Management", "BSBA", "SECOND"),
  s("BA203", "Operations Management", "BSBA", "SECOND"),
  s("BA301", "Financial Management", "BSBA", "THIRD"),
  s("BA302", "Strategic Management", "BSBA", "THIRD"),
  s("BA303", "Business Research", "BSBA", "THIRD"),
];

const CHTM_SUBJECTS = [
  s("TM101", "Introduction to Tourism Management", "BSTM", "FIRST"),
  s("TM102", "Macro Perspective of Tourism and Hospitality", "BSTM", "FIRST"),
  s("TM103", "Risk Management as Applied to Safety, Security and Sanitation", "BSTM", "FIRST"),
  s("TM201", "Tourism and Hospitality Marketing", "BSTM", "SECOND"),
  s("TM202", "Philippine Culture and Tourism Geography", "BSTM", "SECOND"),
  s("TM203", "Global Culture and Tourism Geography", "BSTM", "SECOND"),
  s("TM301", "Travel and Tour Operations", "BSTM", "THIRD"),
  s("TM302", "Sustainable Tourism", "BSTM", "THIRD"),
  s("TM303", "Transportation Management", "BSTM", "THIRD"),
  s("TM401", "Tourism Policy Planning and Development", "BSTM", "FOURTH"),
  s("TM402", "Entrepreneurship in Tourism and Hospitality", "BSTM", "FOURTH"),
  s("TM403", "Research in Tourism", "BSTM", "FOURTH"),
];

const CTE_SUBJECTS = [
  s("EED101", "Foundations of Elementary Education", "BEED", "FIRST"),
  s("EED102", "The Child and Adolescent Learners and Learning Principles", "BEED", "FIRST"),
  s("EED103", "The Teaching Profession", "BEED", "FIRST"),
  s("EED201", "Teaching Science in the Elementary Grades", "BEED", "SECOND"),
  s("EED202", "Teaching Mathematics in the Primary Grades", "BEED", "SECOND"),
  s("EED203", "Facilitating Learner-Centered Teaching", "BEED", "SECOND"),
  s("ED101", "Foundations of Secondary Education", "BSED", "FIRST"),
  s("ED102", "Foundations of Special and Inclusive Education", "BSED", "FIRST"),
  s("ED103", "The Teacher and the Community", "BSED", "FIRST"),
  s("ED201", "Assessment in Learning 1", "BSED", "SECOND"),
  s("ED202", "Technology for Teaching and Learning 1", "BSED", "SECOND"),
  s("ED203", "Building and Enhancing New Literacies Across the Curriculum", "BSED", "SECOND"),
];

const PRE_ELEM_SUBJECTS: DeptSubject[] = [
  { code: "N-LITERACY", name: "Early Literacy", grade: "NURSERY" },
  { code: "N-NUMERACY", name: "Early Numeracy", grade: "NURSERY" },
  { code: "N-PLAY", name: "Play and Movement", grade: "NURSERY" },
  { code: "P-LITERACY", name: "Reading Readiness", grade: "PREPARATORY" },
  { code: "P-NUMERACY", name: "Number Readiness", grade: "PREPARATORY" },
  { code: "P-ARTS", name: "Arts and Crafts", grade: "PREPARATORY" },
  { code: "K-SOCIO", name: "Socio-Emotional Development", grade: "KINDER" },
  { code: "K-ARTS", name: "Creative Arts", grade: "KINDER" },
];

const JHS_TRACK = ["FILIPI", "ENGLIS", "MATHEM", "SCIENC", "ARALIN", "MUSICA", "TECHNO", "EDUKAS"];
const ELEM_LOWER = ["FILIP", "ENGLI", "MATHE", "ARALI", "MUSIC", "EDUKA"];
const ELEM_UPPER = [...ELEM_LOWER.slice(0, 3), "SCIEN", ...ELEM_LOWER.slice(3)];
const jhs = (grade: number, name: string, students: number): DeptSection => ({ name, grade: `GRADE_${grade}` as GradeLevel, students, subjects: JHS_TRACK.map((c) => `${c}${grade}`) });
const elem = (grade: number, name: string, students: number): DeptSection => ({
  name, grade: `GRADE_${grade}` as GradeLevel, students, subjects: (grade < 3 ? ELEM_LOWER : ELEM_UPPER).map((c) => `ELEM${grade}-${c}`),
});

export const DEPARTMENT_PLANS: DeptPlan[] = [
  {
    code: "CCJE", level: "COLLEGE", head: { email: "head.criminaljustice@granby.edu.ph", employeeId: "GC-016" }, newFaculty: 7, subjects: CCJE_SUBJECTS,
    sections: [
      college("BSCRIM", "Criminology", "FIRST", "A", 35, CCJE_SUBJECTS), college("BSCRIM", "Criminology", "FIRST", "B", 35, CCJE_SUBJECTS),
      college("BSCRIM", "Criminology", "SECOND", "A", 35, CCJE_SUBJECTS), college("BSCRIM", "Criminology", "SECOND", "B", 33, CCJE_SUBJECTS),
      college("BSCRIM", "Criminology", "THIRD", "A", 32, CCJE_SUBJECTS), college("BSCRIM", "Criminology", "FOURTH", "A", 30, CCJE_SUBJECTS),
      college("BSISM", "Industrial Security Management", "FIRST", "A", 30, CCJE_SUBJECTS), college("BSISM", "Industrial Security Management", "SECOND", "A", 28, CCJE_SUBJECTS),
    ],
  },
  {
    code: "CBA", level: "COLLEGE", head: { email: "head.business@granby.edu.ph", employeeId: "GC-012" }, newFaculty: 2, subjects: CBA_SUBJECTS,
    sections: [
      college("BSA", "Accountancy", "FIRST", "A", 36, CBA_SUBJECTS), college("BSA", "Accountancy", "SECOND", "A", 34, CBA_SUBJECTS),
      college("BSBA", "Business Administration", "FIRST", "A", 40, CBA_SUBJECTS), college("BSBA", "Business Administration", "SECOND", "A", 38, CBA_SUBJECTS),
      college("BSBA", "Business Administration", "THIRD", "A", 35, CBA_SUBJECTS),
    ],
  },
  {
    code: "CHTM", level: "COLLEGE", head: { email: "head.hospitality@granby.edu.ph", employeeId: "GC-018" }, newFaculty: 4, subjects: CHTM_SUBJECTS,
    sections: [
      college("BSTM", "Tourism Management", "FIRST", "A", 34, CHTM_SUBJECTS), college("BSTM", "Tourism Management", "FIRST", "B", 40, CHTM_SUBJECTS),
      college("BSTM", "Tourism Management", "SECOND", "A", 38, CHTM_SUBJECTS), college("BSTM", "Tourism Management", "THIRD", "A", 36, CHTM_SUBJECTS),
      college("BSTM", "Tourism Management", "FOURTH", "A", 32, CHTM_SUBJECTS),
    ],
  },
  {
    code: "CTE", level: "COLLEGE", head: { email: "head.teachereducation@granby.edu.ph", employeeId: "GC-013" }, newFaculty: 3, subjects: CTE_SUBJECTS,
    sections: [
      college("BEED", "Elementary Education", "FIRST", "A", 28, CTE_SUBJECTS), college("BEED", "Elementary Education", "SECOND", "A", 30, CTE_SUBJECTS),
      college("BSED", "Secondary Education", "FIRST", "A", 25, CTE_SUBJECTS), college("BSED", "Secondary Education", "SECOND", "A", 32, CTE_SUBJECTS),
    ],
  },
  {
    code: "JHS", level: "JUNIOR_HIGH", head: { email: "head.juniorhigh@granby.edu.ph", employeeId: "T-001" }, moveFaculty: ["T-001", "T-002", "T-003"], newFaculty: 3, subjects: [],
    sections: [jhs(7, "Grade 7 - Rizal", 35), jhs(7, "Grade 7 - Bonifacio", 35), jhs(8, "Grade 8 - Mabini", 35), jhs(9, "Grade 9 - Luna", 35), jhs(10, "Grade 10 - Aguinaldo", 35)],
  },
  {
    code: "ELEM", level: "ELEMENTARY", head: { email: "head.elementary@granby.edu.ph", employeeId: "T-005" }, moveFaculty: ["T-004", "T-005"], newFaculty: 6, subjects: [],
    sections: [
      elem(1, "Grade 1 - Rosal", 32), elem(2, "Grade 2 - Ilang-Ilang", 33), elem(3, "Grade 3 - Gumamela", 34),
      elem(4, "Grade 4 - Dahlia", 35), elem(5, "Grade 5 - Orchid", 34), elem(6, "Grade 6 - Camia", 35),
    ],
  },
  {
    code: "PRE-ELEM", level: "PRE_ELEMENTARY", head: { email: "head.preelementary@granby.edu.ph", employeeId: "T-006" }, moveFaculty: ["T-006"], newFaculty: 1, subjects: PRE_ELEM_SUBJECTS,
    sections: [
      { name: "Nursery - Santan", grade: "NURSERY", students: 20, subjects: ["N-LITERACY", "N-NUMERACY", "N-PLAY"] },
      { name: "Preparatory - Waling-Waling", grade: "PREPARATORY", students: 22, subjects: ["P-LITERACY", "P-NUMERACY", "P-ARTS"] },
      { name: "Kinder - Sampaguita", grade: "KINDER", students: 25, subjects: ["K-LITERACY", "K-NUMERACY", "K-SOCIO", "K-ARTS"] },
    ],
  },
];

/** Fictional names combined deterministically for new faculty records. */
export const FIRST_NAMES = ["Adrian", "Bea", "Carlo", "Dianne", "Emil", "Faith", "Gerald", "Hazel", "Ivan", "Janelle", "Kevin", "Lovely", "Marco", "Nina", "Oscar", "Pia", "Quentin", "Rina", "Samuel", "Trixie", "Ulysses", "Vina", "Wilfredo", "Xyza"];
export const LAST_NAMES = ["Aquino", "Bautista", "Cabrera", "Dela Paz", "Espiritu", "Fajardo", "Gatchalian", "Hernandez", "Ilagan", "Jimenez", "Katigbak", "Lualhati", "Magbanua", "Nepomuceno", "Ordonez", "Panganiban", "Quiambao", "Robles", "Sarmiento", "Tagle", "Umali", "Valdez", "Yap", "Zamora"];
