import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export const CurrentSchoolRole = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    return request.schoolRole ?? request.membership?.role;
  },
);
