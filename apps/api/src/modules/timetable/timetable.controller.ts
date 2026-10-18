import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { School } from '@prisma/client';
import {
  saveClassroomSchema,
  savePeriodSchema,
  saveTimetableEntrySchema,
  type SaveClassroomInput,
  type SavePeriodInput,
  type SaveTimetableEntryInput,
} from '@schoolhub/shared';
import { CurrentSchool } from '../../common/decorators/current-school.decorator.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { SchoolTenantGuard } from '../../common/guards/school-tenant.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { TimetableService } from './timetable.service.js';

const READ = ['owner', 'admin', 'teacher', 'staff'] as const;

@Controller('timetable')
@UseGuards(SchoolTenantGuard, RolesGuard)
export class TimetableController {
  constructor(private readonly timetable: TimetableService) {}

  @Get('setup')
  @Roles(...READ)
  setup(@CurrentSchool() school: School, @Query('academicYearId') academicYearId?: string) {
    return this.timetable.getSetup(school.id, academicYearId);
  }

  @Get('mine')
  @Roles('teacher')
  mine(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.timetable.getTeacherOwnTimetable(school.id, user!.id, academicYearId);
  }

  @Get()
  @Roles(...READ)
  view(
    @CurrentSchool() school: School,
    @Query('view') view: string,
    @Query('id') id: string,
    @Query('academicYearId') academicYearId?: string,
  ) {
    if (!['class', 'teacher', 'room'].includes(view) || !id) {
      throw new BadRequestException('Choose a class, teacher or room to view.');
    }
    return this.timetable.getTimetable(
      school.id,
      view as 'class' | 'teacher' | 'room',
      id,
      academicYearId,
    );
  }

  // ---- periods -------------------------------------------------------------
  @Post('periods')
  @Roles('owner', 'admin')
  createPeriod(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(savePeriodSchema)) body: SavePeriodInput,
  ) {
    return this.timetable.createPeriod(school.id, body);
  }

  @Patch('periods/:id')
  @Roles('owner', 'admin')
  updatePeriod(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(savePeriodSchema)) body: SavePeriodInput,
  ) {
    return this.timetable.updatePeriod(school.id, id, body);
  }

  @Delete('periods/:id')
  @Roles('owner', 'admin')
  deletePeriod(@CurrentSchool() school: School, @Param('id') id: string) {
    return this.timetable.deletePeriod(school.id, id);
  }

  // ---- rooms ---------------------------------------------------------------
  @Post('classrooms')
  @Roles('owner', 'admin')
  createClassroom(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(saveClassroomSchema)) body: SaveClassroomInput,
  ) {
    return this.timetable.createClassroom(school.id, body);
  }

  @Patch('classrooms/:id')
  @Roles('owner', 'admin')
  updateClassroom(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveClassroomSchema)) body: SaveClassroomInput,
  ) {
    return this.timetable.updateClassroom(school.id, id, body);
  }

  @Delete('classrooms/:id')
  @Roles('owner', 'admin')
  deleteClassroom(@CurrentSchool() school: School, @Param('id') id: string) {
    return this.timetable.deleteClassroom(school.id, id);
  }

  // ---- lessons -------------------------------------------------------------
  @Post('entries')
  @Roles('owner', 'admin')
  createEntry(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(saveTimetableEntrySchema)) body: SaveTimetableEntryInput,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.timetable.saveEntry(school.id, body, { academicYearId });
  }

  @Put('entries/:id')
  @Roles('owner', 'admin')
  updateEntry(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveTimetableEntrySchema)) body: SaveTimetableEntryInput,
    @Query('academicYearId') academicYearId?: string,
  ) {
    return this.timetable.saveEntry(school.id, body, { entryId: id, academicYearId });
  }

  @Delete('entries/:id')
  @Roles('owner', 'admin')
  deleteEntry(@CurrentSchool() school: School, @Param('id') id: string) {
    return this.timetable.deleteEntry(school.id, id);
  }
}
