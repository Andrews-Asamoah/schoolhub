export const ACADEMIC_CONTEXT_MANAGER_ROLES = [
  "owner",
  "admin",
  "headteacher",
  "accountant",
] as const;

export function canManageAcademicContext(role: string | undefined) {
  return ACADEMIC_CONTEXT_MANAGER_ROLES.includes(
    role as (typeof ACADEMIC_CONTEXT_MANAGER_ROLES)[number],
  );
}
