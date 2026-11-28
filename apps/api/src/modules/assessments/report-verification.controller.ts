import { Controller, Get, Header, Param, UseGuards } from "@nestjs/common";
import { AllowAnonymous } from "@thallesp/nestjs-better-auth";
import { Throttle, ThrottlerGuard } from "@nestjs/throttler";
import { ReportVerificationService } from "./report-verification.service.js";

/** Opened from the QR code on a printed report, so it works without signing in. */
@Controller("report-verification")
@UseGuards(ThrottlerGuard)
export class ReportVerificationController {
  constructor(private readonly verification: ReportVerificationService) {}

  @AllowAnonymous()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header("Cache-Control", "no-store")
  @Get(":versionId/:code")
  verify(@Param("versionId") versionId: string, @Param("code") code: string) {
    return this.verification.verify(versionId, code);
  }
}
