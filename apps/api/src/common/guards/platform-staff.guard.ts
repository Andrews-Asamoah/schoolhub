import { ForbiddenException, Injectable, UnauthorizedException, type CanActivate, type ExecutionContext } from "@nestjs/common";
import { PLATFORM_STAFF_ROLE } from "@schoolhub/shared";
import { isDesktopRequest } from "../desktop-policy.js";
import { assertPasswordChangeNotPending } from "./password-change.js";
import { assertTwoFactorEnabled } from "./two-factor.js";

@Injectable()
export class PlatformStaffGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.session?.user;
    if (!user) throw new UnauthorizedException("Authentication required");
    if (user.role !== PLATFORM_STAFF_ROLE || user.banned || isDesktopRequest(request)) {
      throw new ForbiddenException("An active platform staff account is required on the web portal.");
    }
    assertPasswordChangeNotPending(user);
    assertTwoFactorEnabled(user, "super-admin");
    return true;
  }
}
