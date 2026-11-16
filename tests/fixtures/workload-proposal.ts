import type { PreviewLoads, ProposalRowView, ProposalView } from "@/lib/workload/view";

const row: ProposalRowView = {
  id: "row-1", key: "class-1", label: "CC101 Introduction to Computing, BSCS 1-A", subject: "CC101 Introduction to Computing", section: "BSCS 1-A", amount: 3,
  fromFacultyId: "grace", from: "Grace Mercado", fromInactive: true, toFacultyId: "jonathan", to: "Jonathan M. Bilea",
  fromBefore: 9, fromAfter: 6, toBefore: 6, toAfter: 9, reason: "Grace Mercado is no longer active. Move this class to a qualified faculty member who is free at every meeting.",
  status: "PENDING", edited: false, awaiting: null, problem: null, canApprove: true, canReject: true,
  candidates: [{ id: "jonathan", name: "Jonathan M. Bilea", after: 9 }, { id: "liza", name: "Liza Cruz", after: 3 }],
};
export const workloadProposalFixture: ProposalView = {
  id: "proposal", version: 1, status: "PENDING", automatic: true, createdAt: "2026-11-16T02:00:00Z", reviewedAt: null,
  explanation: "Suggested changes move classes from inactive faculty and balance teaching loads within the allowed range.", reviewNote: null,
  department: "College of Informatics and Computing Sciences", canReview: true, needsRefresh: false,
  rows: [row,
    { ...row, id: "row-2", key: "class-2", label: "PATHFIT1 Human Enhancement, BSIT 1-B", subject: "PATHFIT1 Human Enhancement", section: "BSIT 1-B", from: "Ryan G. Grumal", fromFacultyId: "ryan", fromInactive: false, fromBefore: 24, fromAfter: 21, to: "Arby R. Miranda", toFacultyId: "arby", toBefore: 0, toAfter: 3, reason: "Ryan G. Grumal is above the maximum teaching load.", candidates: [{ id: "arby", name: "Arby R. Miranda", after: 3 }] },
    { ...row, id: "row-3", key: "class-3", label: "NSTP1 Civic Welfare Training Services, BSIT 1-A", subject: "NSTP1 Civic Welfare Training Services", section: "BSIT 1-A", canApprove: false, problem: "The receiving faculty member now has another class at this time. Choose a different recipient or refresh suggestions.", candidates: [] },
    { ...row, id: "row-4", key: "class-4", label: "GE101 Understanding the Self, BSCS 1-B", subject: "GE101 Understanding the Self", section: "BSCS 1-B", to: "Maria Reyes", toFacultyId: "maria", status: "APPROVED", canApprove: false, awaiting: "Awaiting General Education Department approval", candidates: null },
  ],
};
export const workloadPreviewFixture: PreviewLoads = {
  grace: { name: "Grace Mercado", load: 9, minimum: 0, maximum: 24, inactive: true },
  jonathan: { name: "Jonathan M. Bilea", load: 6, minimum: 12, maximum: 24 },
  ryan: { name: "Ryan G. Grumal", load: 24, minimum: 12, maximum: 24 },
  arby: { name: "Arby R. Miranda", load: 0, minimum: 12, maximum: 24 },
  maria: { name: "Maria Reyes", load: 6, minimum: 12, maximum: 24 },
};
