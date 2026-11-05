import { Module } from '@nestjs/common';
import { TimetableController } from './timetable.controller.js';
import { TimetableImportService } from './timetable-import.service.js';
import { TimetableService } from './timetable.service.js';

@Module({
  controllers: [TimetableController],
  providers: [TimetableService, TimetableImportService],
})
export class TimetableModule {}
