import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import { actorFromRequest, type AuditActor } from "./audit.js";

/** Injects who/where/what-client for the current request into audit writes. */
export const AuditActorParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuditActor =>
    actorFromRequest(ctx.switchToHttp().getRequest()),
);
