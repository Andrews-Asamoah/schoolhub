import { Controller, Get } from "@nestjs/common";
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth";

@Controller()
export class HealthController {
  @AllowAnonymous()
  @Get("health")
  health() {
    return { ok: true };
  }

  // Protected by default: the library registers a global auth guard
  @Get("me")
  me(@Session() session: UserSession) {
    return session;
  }
}