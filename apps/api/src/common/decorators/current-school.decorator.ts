import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { School } from "@prisma/client";

export const CurrentSchool = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): School => {
    const request = ctx.switchToHttp().getRequest();
    return request.school;
  },
);
