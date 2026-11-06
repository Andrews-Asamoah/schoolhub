import type { HttpException } from "@nestjs/common";

/** The human-readable message of an HttpException, whether Nest or Zod produced its body. */
export function httpExceptionMessage(error: HttpException): string {
  const body = error.getResponse();
  if (typeof body === "string") return body;
  if (typeof body === "object" && body !== null && "message" in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === "string") return message;
    if (Array.isArray(message)) return message.join(" ");
  }
  return error.message;
}
