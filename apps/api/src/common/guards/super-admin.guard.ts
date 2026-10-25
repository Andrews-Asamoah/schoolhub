import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { assertPasswordChangeNotPending } from "./password-change.js";

/**
 * SuperAdminGuard — allows only users with role === "superAdmin" to proceed.
 * Must be applied AFTER the Better Auth session middleware has populated request.session.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.session?.user;

    if (!user) {
      throw new UnauthorizedException("Authentication required");
    }

    if (user.banned === true) {
      throw new ForbiddenException("This account has been suspended.");
    }

    assertPasswordChangeNotPending(user);

    if (user.role !== "superAdmin") {
      throw new ForbiddenException(
        "Access denied: SuperAdmin privileges required",
      );
    }

    return true;
  }
}
