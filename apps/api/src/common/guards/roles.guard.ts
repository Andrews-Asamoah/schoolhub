import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ROLES_KEY } from "../decorators/roles.decorator.js";

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.session?.user;
    const membership = request.membership;

    if (!user) {
      throw new ForbiddenException("Access denied: Unauthenticated user");
    }

    // Platform SuperAdmin bypasses tenant role restrictions
    if (user.role === "superAdmin") {
      return true;
    }

    if (!membership) {
      throw new ForbiddenException("Access denied: No active school membership");
    }

    const hasRole = requiredRoles.includes(membership.role);
    if (!hasRole) {
      throw new ForbiddenException(
        `Insufficient permissions. Required roles: [${requiredRoles.join(", ")}]. Current role: ${membership.role}`,
      );
    }

    return true;
  }
}
