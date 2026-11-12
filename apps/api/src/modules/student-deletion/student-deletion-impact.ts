/**
 * What permanently removing a student would touch. Kept free of database code
 * so the rules are easy to read and test.
 */

export interface CountLine {
  key: string;
  label: string;
  count: number;
}

/**
 * Records that must never disappear with a student. Money and exam records are
 * accounting or legal records, so a student who has any of them is withdrawn,
 * not deleted.
 */
const BLOCKERS: ReadonlyArray<readonly [string, string]> = [
  ["bills", "fee bills"],
  ["payments", "payments"],
  ["billAdjustments", "fee bill adjustments"],
  ["creditEntries", "credit balance entries"],
  ["externalExamCandidates", "external exam (such as BECE) registrations"],
];

/** Records that are removed together with the student. */
const REMOVED: ReadonlyArray<readonly [string, string]> = [
  ["enrollments", "class enrolments"],
  ["attendances", "attendance marks"],
  ["assessmentScores", "assessment scores"],
  ["remarks", "teacher remarks"],
  ["reportCards", "report cards"],
  ["reportCardVersions", "report card versions"],
  ["assignmentSubmissions", "assignment submissions"],
  ["clubMembers", "club memberships"],
  ["promotionRecords", "promotion records"],
  ["documents", "uploaded documents"],
  ["transcripts", "transcript requests"],
  ["attendanceExcuseRequests", "absence requests"],
  ["attendanceExclusions", "attendance exclusions"],
  ["scholarships", "scholarships"],
  ["guardianLinks", "guardian links"],
];

export interface DeletionImpact {
  /** Anything listed here stops the deletion. */
  blockers: CountLine[];
  /** Records that go with the student. Only non-zero lines are listed. */
  willDelete: CountLine[];
  canDelete: boolean;
}

export function buildImpact(counts: Record<string, number>): DeletionImpact {
  const lines = (table: ReadonlyArray<readonly [string, string]>): CountLine[] =>
    table
      .map(([key, label]) => ({ key, label, count: counts[key] ?? 0 }))
      .filter((line) => line.count > 0);
  const blockers = lines(BLOCKERS);
  return { blockers, willDelete: lines(REMOVED), canDelete: blockers.length === 0 };
}

/** "3 payments and 1 fee bill" for error messages. */
export function describeBlockers(blockers: CountLine[]): string {
  const parts = blockers.map((line) => `${line.count} ${line.label}`);
  if (parts.length <= 1) return parts.join("");
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export interface GuardianCandidate {
  id: string;
  name: string;
  /** Students this guardian is linked to, this one included. */
  linkedStudents: number;
  userId: string | null;
  /** The guardian's account also carries another role (staff, teacher, student). */
  hasOtherRole: boolean;
}

export interface GuardianPlan {
  /** Linked only to this student: removed too, so no orphaned parent records stay behind. */
  remove: GuardianCandidate[];
  /** Linked to a sibling as well, so they stay. */
  keep: GuardianCandidate[];
}

export function planGuardians(candidates: GuardianCandidate[]): GuardianPlan {
  const remove: GuardianCandidate[] = [];
  const keep: GuardianCandidate[] = [];
  for (const guardian of candidates) (guardian.linkedStudents <= 1 ? remove : keep).push(guardian);
  return { remove, keep };
}

/**
 * Only a login that exists purely for this role may be deleted with the
 * record. An account that is also an administrator, a teacher, or in another
 * school is left alone, because deleting it would lock that person out.
 */
export function isDedicatedLogin(
  user: { role: string | null } | null,
  memberRoles: string[],
  expectedRole: string,
): boolean {
  if (!user || user.role === "superAdmin") return false;
  return memberRoles.length > 0 && memberRoles.every((role) => role === expectedRole);
}
