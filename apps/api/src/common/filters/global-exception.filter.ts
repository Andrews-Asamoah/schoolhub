import { randomUUID } from "node:crypto";
import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

interface PrismaLikeError {
  code: string;
  message?: string;
  meta?: Record<string, unknown>;
}

function isPrismaLikeError(value: unknown): value is PrismaLikeError {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof (value as { code: unknown }).code === "string" &&
    /^P\d{4}$/.test((value as { code: string }).code)
  );
}

/** Column names behind a unique violation, for both the engine and driver-adapter error shapes. */
function uniqueFields(meta: Record<string, unknown> | undefined): string {
  const direct = meta?.target;
  if (Array.isArray(direct)) return direct.join(", ");
  if (typeof direct === "string") return direct;
  const cause = (meta?.driverAdapterError as { cause?: { constraint?: { fields?: unknown } } } | undefined)
    ?.cause;
  const fields = cause?.constraint?.fields;
  if (Array.isArray(fields)) return fields.join(", ");
  return "value";
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number = HttpStatus.INTERNAL_SERVER_ERROR;
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
    } else if (isPrismaLikeError(exception)) {
      switch (exception.code) {
        case "P2002":
          status = HttpStatus.CONFLICT;
          message = `A record with this ${uniqueFields(exception.meta)} already exists.`;
          error = "Conflict";
          break;
        case "P2003":
          // e.g. a department/class/house id that does not exist
          status = HttpStatus.BAD_REQUEST;
          message =
            "One of the selected items (department, class, house, ...) no longer exists. Refresh the page and choose again.";
          error = "BadRequest";
          break;
        case "P2000":
          status = HttpStatus.BAD_REQUEST;
          message = "One of the values is too long.";
          error = "BadRequest";
          break;
        case "P2025":
          status = HttpStatus.NOT_FOUND;
          message = "The requested record was not found.";
          error = "NotFound";
          break;
        default:
          break; // anything else is a genuine server fault: logged below
      }
    }

    if (status >= 500) {
      // Never swallow a server fault: log everything, return only a reference.
      const errorId = randomUUID().slice(0, 8);
      const detail =
        exception instanceof Error ? exception.message : JSON.stringify(exception);
      this.logger.error(
        `[${errorId}] ${request.method} ${request.url} -> ${detail}`,
        exception instanceof Error ? exception.stack : undefined,
      );
      message = `Internal server error (ref ${errorId})`;
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
