import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { AttendanceCalendarService } from "./attendance-calendar.service.js";
import { AttendanceReviewService } from "./attendance-review.service.js";

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceCalendarService, AttendanceReviewService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
