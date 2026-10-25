import {
  Injectable,
  Logger,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { evaluateSubscriptionAccess, SUBSCRIPTION_INACTIVE } from "@schoolhub/shared";
import { PrismaService } from "../../prisma/prisma.service.js";
import { actorFromRequest, writeAudit } from "../audit/audit.js";
import { ALLOW_INACTIVE_SUBSCRIPTION } from "../decorators/allow-inactive-subscription.decorator.js";
import { assertPasswordChangeNotPending } from "./password-change.js";

/** A superAdmin entering a school is audited at most once per window, not per request. */
const ACCESS_AUDIT_WINDOW_MS = 15 * 60 * 1000;
const recentSuperAdminAccess = new Map<string, number>();

const INACTIVE_MESSAGES: Record<string, string> = {
  SUSPENDED: "This school's subscription is suspended. Please contact SchoolHub support.",
  CANCELLED: "This school's subscription has been cancelled. Please contact SchoolHub support.",
  EXPIRED: "This school's subscription has expired. Please renew to continue.",
};

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
  private readonly logger = new Logger(SchoolTenantGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const session = request.session;

    if (!session?.user) {
      throw new UnauthorizedException("Authentication required");
    }

    const user = session.user;
    if (user.banned === true) {
      throw new ForbiddenException("This account has been suspended.");
    }
    assertPasswordChangeNotPending(user);
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

    // Load school details (plus the subscription fields used for access control)
    const schoolWithOrg = await this.prisma.client.school.findUnique({
      where: { organizationId },
      include: { organization: { select: { subscriptionStatus: true, expiresAt: true } } },
    });

    if (!schoolWithOrg) {
      throw new ForbiddenException("School not found for this organization.");
    }
    const { organization, ...school } = schoolWithOrg;

    if (isSuperAdmin) {
      this.auditSuperAdminAccess(request, user.id, school.id);
    } else {
      const allowInactive = this.reflector.get<boolean>(
        ALLOW_INACTIVE_SUBSCRIPTION,
        context.getHandler(),
      );
      const access = evaluateSubscriptionAccess(
        organization.subscriptionStatus,
        organization.expiresAt,
      );
      if (!access.allowed && !allowInactive) {
        throw new ForbiddenException({
          message:
            INACTIVE_MESSAGES[access.reason] ??
            "This school's subscription is not active. Please contact SchoolHub support.",
          error: SUBSCRIPTION_INACTIVE,
          reason: access.reason,
        });
      }
    }

    // Attach to request context
    request.school = school;
    request.membership = member;

    return true;
  }

  /** Records that a platform superAdmin entered a school's data (rate-limited per user and school). */
  private auditSuperAdminAccess(request: any, userId: string, schoolId: string) {
    const key = `${userId}:${schoolId}`;
    const now = Date.now();
    const last = recentSuperAdminAccess.get(key);
    if (last && now - last < ACCESS_AUDIT_WINDOW_MS) return;
    recentSuperAdminAccess.set(key, now);
    if (recentSuperAdminAccess.size > 1000) {
      for (const [entry, at] of recentSuperAdminAccess) {
        if (now - at > ACCESS_AUDIT_WINDOW_MS) recentSuperAdminAccess.delete(entry);
      }
    }
    void writeAudit(this.prisma.client, actorFromRequest(request), {
      action: "SCHOOL_ACCESSED",
      entityType: "super-admin.school.access",
      entityId: schoolId,
      schoolId,
      newValues: { method: request.method, path: request.originalUrl?.split("?")[0] ?? request.path },
    }).catch((error: Error) => {
      this.logger.error(`SuperAdmin access audit failed: ${error.message}`);
    });
  }
}
