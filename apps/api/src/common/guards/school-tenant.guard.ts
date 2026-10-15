import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class SchoolTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = request.session;

    if (!session?.user) {
      throw new UnauthorizedException("Authentication required");
    }

    // Determine active organization / school ID
    const organizationId =
      session.session?.activeOrganizationId ??
      (request.headers["x-organization-id"] as string | undefined);

    if (!organizationId) {
      throw new ForbiddenException(
        "No active school selected. Please set an active organization in your session.",
      );
    }

    // Check if user is a member of this organization or a global superAdmin
    const user = session.user;
    const isSuperAdmin = user.role === "superAdmin";

    const member = await this.prisma.client.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId,
          userId: user.id,
        },
      },
    });

    if (!member && !isSuperAdmin) {
      throw new ForbiddenException(
        "You are not a registered member of this school.",
      );
    }
    if (member?.banned && !isSuperAdmin) {
      throw new ForbiddenException(
        "Your membership in this school has been suspended.",
      );
    }
    if (!isSuperAdmin && member) {
      const schoolMembershipCount = await this.prisma.client.member.count({
        where: { userId: user.id },
      });
      if (schoolMembershipCount > 1) {
        throw new ForbiddenException(
          "This account is linked to more than one school. Use separate credentials for each school.",
        );
      }

      const availableRoles = new Set([member.role, ...member.roles]);
      const requestedRole = request.headers["x-school-role"];
      const activeRole =
        typeof requestedRole === "string" && requestedRole.length > 0
          ? requestedRole
          : member.role;
      if (!availableRoles.has(activeRole)) {
        throw new ForbiddenException(
          "The selected role is not assigned to your school account.",
        );
      }
      request.schoolRole = activeRole;
    }

    // Load school details
    const school = await this.prisma.client.school.findUnique({
      where: { organizationId },
    });

    if (!school) {
      throw new ForbiddenException("School not found for this organization.");
    }

    // Attach to request context
    request.school = school;
    request.membership = member;

    return true;
  }
}
