import { ExcuseRequestsController } from "./excuse-requests.controller.js";
import { ExcuseRequestsService } from "./excuse-requests.service.js";
import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { AttendanceCalendarService } from "./attendance-calendar.service.js";
import { AttendanceReplayRetention } from "./attendance-replay-retention.js";
import { AttendanceReviewService } from "./attendance-review.service.js";

@Module({
  controllers: [AttendanceController, ExcuseRequestsController],
  providers: [ExcuseRequestsService, AttendanceService, AttendanceCalendarService, AttendanceReviewService, AttendanceReplayRetention],
  exports: [AttendanceService],
})
export class AttendanceModule {}
