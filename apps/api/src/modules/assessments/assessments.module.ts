import { Module } from "@nestjs/common";
import { AssessmentsController } from "./assessments.controller.js";
import { AssessmentSetupController } from "./assessment-setup.controller.js";
import { AssessmentSetupService } from "./assessment-setup.service.js";
import { AssessmentEntryService } from "./assessment-entry.service.js";
import { AssessmentMarksImportService } from "./assessment-marks-import.service.js";
import { AssessmentTrackingService } from "./assessment-tracking.service.js";
import { AssessmentCorrectionService } from "./assessment-correction.service.js";
import { AssessmentWorkflowController } from "./assessment-workflow.controller.js";
import { AssessmentsService } from "./assessments.service.js";
import { ReportPublicationController } from "./report-publication.controller.js";
import { ReportPublicationService } from "./report-publication.service.js";
import { ReportVersionService } from "./report-version.service.js";
import { InternalExamsController } from "./internal-exams.controller.js";
import { InternalExamMarksImportService } from "./internal-exam-marks-import.service.js";
import { InternalExamsService } from "./internal-exams.service.js";
import { MockReportService } from "./mock-report.service.js";
import { MockCorrectionService } from "./mock-correction.service.js";
import { MockAnalyticsController } from "./mock-analytics.controller.js";
import { MockAnalyticsService } from "./mock-analytics.service.js";
import { ExternalExamsController } from "./external-exams.controller.js";
import { ExternalExamsService } from "./external-exams.service.js";
import { ExternalBeceImportService } from "./external-bece-import.service.js";
import { ReportTemplatePresetsService } from "./report-template-presets.service.js";

@Module({
  controllers: [AssessmentsController, AssessmentWorkflowController, AssessmentSetupController, ReportPublicationController, InternalExamsController, ExternalExamsController, MockAnalyticsController],
  providers: [AssessmentsService, AssessmentEntryService, AssessmentMarksImportService, AssessmentTrackingService, AssessmentCorrectionService, AssessmentSetupService, ReportPublicationService, ReportVersionService, InternalExamsService, InternalExamMarksImportService, MockReportService, MockCorrectionService, ExternalExamsService, ExternalBeceImportService, MockAnalyticsService, ReportTemplatePresetsService],
  exports: [AssessmentsService],
})
export class AssessmentsModule {}
