import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = "Internal server error";
    let error = "InternalServerError";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        message = res;
      } else if (typeof res === "object" && res !== null) {
        message = (res as { message?: string | object }).message ?? res;
        error = (res as { error?: string }).error ?? exception.name;
      }
    } else if (typeof exception === "object" && exception !== null && "code" in exception) {
      // Prisma error handling
      const prismaErr = exception as { code: string; meta?: Record<string, unknown> };
      if (prismaErr.code === "P2002") {
        status = HttpStatus.CONFLICT;
        const target = (prismaErr.meta?.target as string[])?.join(", ") ?? "field";
        message = `A record with this ${target} already exists.`;
        error = "Conflict";
      } else if (prismaErr.code === "P2025") {
        status = HttpStatus.NOT_FOUND;
        message = "The requested record was not found.";
        error = "NotFound";
      }
    } else if (exception instanceof Error) {
      message = exception.message;
      this.logger.error(`Unhandled Exception: ${exception.message}`, exception.stack);
    }

    response.status(status).json({
      statusCode: status,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
