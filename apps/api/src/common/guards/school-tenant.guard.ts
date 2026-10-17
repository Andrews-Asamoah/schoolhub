import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

function extractSubdomain(req: any): string | null {
  const customHeader = req.headers["x-school-subdomain"];
  if (typeof customHeader === "string" && customHeader.trim().length > 0) {
    return customHeader.trim().toLowerCase();
  }

  const rawHost = (req.headers["x-forwarded-host"] || req.headers["host"] || "") as string;
  const host = rawHost.split(":")[0]?.toLowerCase();
  if (!host) return null;

  // Check for localhost subdomain: e.g. achimota.localhost
  const localMatch = host.match(/^([a-z0-9-]+)\.localhost$/i);
  if (localMatch && localMatch[1]) {
    const sub = localMatch[1].toLowerCase();
    if (!["api", "admin", "www", "app", "demo", "staging"].includes(sub)) {
      return sub;
    }
  }

  // Check for root domain subdomain: e.g. achimota.schoolhub.gh or achimota.schoolhub.app
  const domainMatch = host.match(/^([a-z0-9-]+)\.schoolhub\.(gh|app|com)$/i);
  if (domainMatch && domainMatch[1]) {
    const sub = domainMatch[1].toLowerCase();
    if (!["api", "admin", "www", "app", "demo", "staging"].includes(sub)) {
      return sub;
    }
  }

  return null;
}

@Injectable()
export class SchoolTenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = request.session;

    if (!session?.user) {
      throw new UnauthorizedException("Authentication required");
    }

    const user = session.user;
    const isSuperAdmin = user.role === "superAdmin";

    // Determine active organization / school ID
    const detectedSubdomain = extractSubdomain(request);
    let organizationId: string | undefined;

    if (detectedSubdomain) {
      const schoolBySubdomain = await this.prisma.client.school.findUnique({
        where: { subdomain: detectedSubdomain },
      });

      if (!schoolBySubdomain) {
        throw new NotFoundException(`School domain "${detectedSubdomain}" does not exist.`);
      }

      if (isSuperAdmin) {
        organizationId = schoolBySubdomain.organizationId;
      } else {
        const member = await this.prisma.client.member.findUnique({
          where: {
            organizationId_userId: {
              organizationId: schoolBySubdomain.organizationId,
              userId: user.id,
            },
          },
        });

        if (!member) {
          throw new ForbiddenException(
            `Cross-school access blocked: You are not authorized to access ${schoolBySubdomain.name} (${detectedSubdomain}).`,
          );
        }

        organizationId = schoolBySubdomain.organizationId;
      }
    } else {
      organizationId =
        session.session?.activeOrganizationId ??
        (request.headers["x-organization-id"] as string | undefined);
    }

    if (!organizationId) {
      throw new ForbiddenException(
        "No active school selected. Please set an active organization in your session.",
      );
    }

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
