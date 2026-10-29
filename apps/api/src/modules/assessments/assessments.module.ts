import { Module } from "@nestjs/common";
import { AssessmentsController } from "./assessments.controller.js";
import { AssessmentSetupController } from "./assessment-setup.controller.js";
import { AssessmentSetupService } from "./assessment-setup.service.js";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import { AssessmentsService } from "./assessments.service.js";
import { ReportPublicationController } from "./report-publication.controller.js";
import { ReportPublicationService } from "./report-publication.service.js";
import { ReportVersionService } from "./report-version.service.js";
import { InternalExamsController } from "./internal-exams.controller.js";
import { InternalExamsService } from "./internal-exams.service.js";
import { MockReportService } from "./mock-report.service.js";
import { MockCorrectionService } from "./mock-correction.service.js";
import { ExternalExamsController } from "./external-exams.controller.js";
import { ExternalExamsService } from "./external-exams.service.js";
import { ExternalBeceImportService } from "./external-bece-import.service.js";
import { ReportTemplatePresetsService } from "./report-template-presets.service.js";

@Module({
  controllers: [AssessmentsController, AssessmentSetupController, ReportPublicationController, InternalExamsController, ExternalExamsController],
  providers: [AssessmentsService, AssessmentEntryService, AssessmentSetupService, ReportPublicationService, ReportVersionService, InternalExamsService, MockReportService, MockCorrectionService, ExternalExamsService, ExternalBeceImportService, ReportTemplatePresetsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
