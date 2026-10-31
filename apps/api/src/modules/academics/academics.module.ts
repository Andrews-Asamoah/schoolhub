import { AcademicRolloverController } from "./academic-rollover.controller.js";
import { AcademicRolloverService } from "./academic-rollover.service.js";
import { Module } from "@nestjs/common";
import { AcademicsController } from "./academics.controller.js";
import { AcademicsService } from "./academics.service.js";

@Module({
  controllers: [AcademicRolloverController, AcademicsController],
  providers: [AcademicRolloverService, AcademicsService],
  exports: [AcademicsService],
})
export class AcademicsModule {}
