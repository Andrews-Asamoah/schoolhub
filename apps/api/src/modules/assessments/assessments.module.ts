import { Module } from "@nestjs/common";
import { AssessmentsController } from "./assessments.controller.js";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import { AssessmentsService } from "./assessments.service.js";

@Module({
  controllers: [AssessmentsController],
  providers: [AssessmentsService, AssessmentEntryService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
