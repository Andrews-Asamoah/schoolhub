import { useSchoolRole } from "@/components/school/school-role-switcher";

/**
 * Roles allowed to download, print or export table data. Students and
 * guardians see their own records on screen but cannot bulk-export. The API
 * stays the real access check: exports only contain rows the user could
 * already load.
 */
export const TABLE_EXPORT_ROLES = ["owner", "admin", "headmistress", "accountant", "teacher", "staff"] as const;

export function canExportTables(role: string | null | undefined) {
  return !!role && (TABLE_EXPORT_ROLES as readonly string[]).includes(role);
}

/** For school workspaces and portals; platform-console pages pass `canExport` directly. */
export function useCanExportTables() {
  const { activeRole } = useSchoolRole();
  return canExportTables(activeRole);
}
