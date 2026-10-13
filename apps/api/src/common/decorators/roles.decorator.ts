import { SetMetadata } from "@nestjs/common";
import type { Role } from "@schoolhub/shared";

export const ROLES_KEY = "roles";
export const Roles = (...roles: (Role | "superAdmin")[]) =>
  SetMetadata(ROLES_KEY, roles);
