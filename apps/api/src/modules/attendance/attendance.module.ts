import { Module } from "@nestjs/common";
import { AttendanceController } from "./attendance.controller.js";
import { AttendanceService } from "./attendance.service.js";
import { AttendanceCalendarService } from "./attendance-calendar.service.js";

@Module({
  controllers: [AttendanceController],
  providers: [AttendanceService, AttendanceCalendarService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
