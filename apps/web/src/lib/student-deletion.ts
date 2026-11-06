/** Shapes returned by the student-deletion endpoints. */
export type DeletionStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export interface DeletionRequest {
  id: string;
  schoolId: string;
  studentId: string;
  studentName: string;
  admissionNumber: string | null;
  className: string | null;
  reason: string;
  status: DeletionStatus;
  requestedByName: string;
  reviewedByName: string | null;
  reviewedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface PlatformDeletionRequest extends DeletionRequest {
  school: { id: string; name: string; code: string; subdomain: string };
}

export interface CountLine { key: string; label: string; count: number }

export interface DeletionImpact {
  alreadyHandled?: false;
  studentRemoved?: false;
  student: { name: string; admissionNumber: string | null; className: string | null; status: string };
  blockers: CountLine[];
  willDelete: CountLine[];
  canDelete: boolean;
  guardiansRemoved: string[];
  guardiansKept: string[];
  studentLoginRemoved: boolean;
}

export function formatRequestDate(value: string) {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function blockerSentence(blockers: CountLine[]) {
  const parts = blockers.map((line) => `${line.count} ${line.label}`);
  return parts.length <= 1 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** The "this will be removed" list, shared by the school and platform screens. */
export function removalSummary(impact: DeletionImpact) {
  const items = impact.willDelete.map((line) => `${line.count} ${line.label}`);
  if (impact.studentLoginRemoved) items.unshift("the student's sign-in account");
  if (impact.guardiansRemoved.length) {
    items.push(`${impact.guardiansRemoved.length === 1 ? "parent" : "parents"} with no other child here (${impact.guardiansRemoved.join(", ")})`);
  }
  return items;
}
