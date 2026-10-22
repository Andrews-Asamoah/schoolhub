import { Module } from "@nestjs/common";
import { AssessmentsController } from "./assessments.controller.js";
import { AssessmentSetupController } from "./assessment-setup.controller.js";
import { AssessmentSetupService } from "./assessment-setup.service.js";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import { AssessmentsService } from "./assessments.service.js";

@Module({
  controllers: [AssessmentsController, AssessmentSetupController],
  providers: [AssessmentsService, AssessmentEntryService, AssessmentSetupService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
