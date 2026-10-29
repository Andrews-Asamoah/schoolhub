import { Controller, Get, Logger, ServiceUnavailableException } from "@nestjs/common";
import { AllowAnonymous, Session, type UserSession } from "@thallesp/nestjs-better-auth";
import { PrismaService } from "./prisma/prisma.service.js";

const READINESS_TIMEOUT_MS = 2_000;

/** Same precedence the super-admin operations report uses. */
export function buildVersion(env: NodeJS.ProcessEnv = process.env): string {
  return env.BUILD_SHA ?? env.GIT_SHA ?? env.SOURCE_VERSION ?? "unknown";
}

/** Resolves true if the database answers a trivial query before the timeout. */
export async function databaseIsReachable(
  ping: () => Promise<unknown>,
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      ping(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("database check timed out")), timeoutMs);
      }),
    ]);
    return true;
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

@Controller()
export class HealthController {
  private readonly logger = new Logger(HealthController.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Legacy probe kept for existing monitors and CI. Same as /health/live. */
  @AllowAnonymous()
  @Get("health")
  health() {
    return { ok: true };
  }

  /** Liveness: the process is up and serving HTTP. Never touches dependencies. */
  @AllowAnonymous()
  @Get("health/live")
  live() {
    return { status: "ok", version: buildVersion() };
  }

  /**
   * Readiness: the instance can serve traffic, which needs the database.
   * Returns 503 otherwise so a load balancer stops routing to it. Object
   * storage is deliberately excluded: an R2 outage must not take the whole
   * API out of rotation (see the authenticated super-admin operations report
   * for storage and migration status).
   */
  @AllowAnonymous()
  @Get("health/ready")
  async ready() {
    const ok = await databaseIsReachable(() => this.prisma.client.$queryRaw`SELECT 1`);
    if (!ok) {
      this.logger.error("Readiness check failed: database unreachable");
      throw new ServiceUnavailableException({ status: "unavailable", database: "down" });
    }
    return { status: "ready", database: "up", version: buildVersion() };
  }

  // Protected by default: the library registers a global auth guard
  @Get("me")
  me(@Session() session: UserSession) {
    return session;
  }
}
