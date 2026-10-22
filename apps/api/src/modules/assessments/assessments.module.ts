import { Module } from "@nestjs/common";
import { AssessmentsController } from "./assessments.controller.js";
import { AssessmentSetupController } from "./assessment-setup.controller.js";
import { AssessmentSetupService } from "./assessment-setup.service.js";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import { AssessmentsService } from "./assessments.service.js";
import { ReportPublicationController } from "./report-publication.controller.js";
import { ReportPublicationService } from "./report-publication.service.js";

@Module({
  controllers: [AssessmentsController, AssessmentSetupController, ReportPublicationController],
  providers: [AssessmentsService, AssessmentEntryService, AssessmentSetupService, ReportPublicationService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
