import { z } from "zod";
import { defineEndpoint } from "./endpoint";
// Shape verified against SchoolsService.getMemberRoles; no shared response schema exists.
export const schoolRolesSchema = z.object({
  primaryRole: z.string(),
  roles: z.array(z.string()),
});
export const getSchoolRoles = defineEndpoint({
  method: "GET",
  path: "/schools/roles",
  roles: ["teacher", "student", "guardian"],
  scope: "discovery",
  response: schoolRolesSchema,
});
