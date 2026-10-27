import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseEnumPipe,
  Post,
  UseGuards,
} from "@nestjs/common";
import { Session, type UserSession } from "@thallesp/nestjs-better-auth";
import {
  CREDENTIAL_SUBJECT_KINDS,
  changePasswordSchema,
  type ChangePasswordInput,
  type CredentialSubjectKind,
} from "@schoolhub/shared";
import type { School } from "@prisma/client";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import { AccountsService } from "./accounts.service.js";
import { AuditActorParam } from "../../common/audit/audit-actor.decorator.js";
import type { AuditActor } from "../../common/audit/audit.js";

/**
 * Deliberately NOT behind SchoolTenantGuard: a user whose password is still
 * temporary is blocked there, and this is the one route that lets them out.
 * The global Better Auth guard still requires a valid session.
 */
@Controller("account")
export class AccountController {
  constructor(private readonly accounts: AccountsService) {}

  @Get("security/trusted-devices")
  @Header("Cache-Control", "no-store")
  listTrustedDevices(@Session() session: UserSession) {
    return this.accounts.listTrustedDevices(session.user as { id: string; role?: string; mustChangePassword?: boolean });
  }

  @Delete("security/trusted-devices/revoke-all")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  revokeAllTrustedDevices(
    @Session() session: UserSession,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.accounts.revokeAllTrustedDevices(
      session.user as { id: string; role?: string; mustChangePassword?: boolean },
      actor,
    );
  }

  @Delete("security/trusted-devices/:deviceId")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  revokeTrustedDevice(
    @Session() session: UserSession,
    @Param("deviceId") deviceId: string,
    @AuditActorParam() actor: AuditActor,
  ) {
    return this.accounts.revokeTrustedDevice(
      session.user as { id: string; role?: string; mustChangePassword?: boolean },
      deviceId,
      actor,
    );
  }

  @Post("change-password")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  changePassword(
    @Session() session: UserSession,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.accounts.changeOwnPassword(session.user, session.session.token, body);
  }
}

@Controller("accounts")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AccountsAdminController {
  constructor(private readonly accounts: AccountsService) {}

  /** Issue or reset a temporary login for a student/teacher/staff/guardian record. */
  @Post("people/:kind/:id/credentials")
  @Roles("owner", "admin", "headteacher")
  @HttpCode(200)
  @Header("Cache-Control", "no-store")
  issue(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() schoolRole: string | undefined,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Param("kind", new ParseEnumPipe(CREDENTIAL_SUBJECT_KINDS)) kind: CredentialSubjectKind,
    @Param("id") id: string,
  ) {
    return this.accounts.issueCredentials(
      school,
      { id: actor!.id, schoolRole },
      kind,
      id,
    );
  }
}
