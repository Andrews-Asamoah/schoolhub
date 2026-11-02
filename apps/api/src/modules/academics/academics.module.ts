import { AcademicRolloverController } from "./academic-rollover.controller.js";
import { AcademicRolloverService } from "./academic-rollover.service.js";
import { Module } from "@nestjs/common";
import { AcademicsController } from "./academics.controller.js";
import { AcademicsService } from "./academics.service.js";
import { AcademicStructureImportService } from "./academic-structure-import.service.js";

@Module({
  controllers: [AcademicRolloverController, AcademicsController],
  providers: [AcademicRolloverService, AcademicsService, AcademicStructureImportService],
  exports: [AcademicsService],
})
export class AcademicsModule {}
