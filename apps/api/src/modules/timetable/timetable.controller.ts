import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { School } from '@prisma/client';
import {
  copyPeriodsSchema,
  importTimetableBatchSchema,
  saveClassroomSchema,
  savePeriodSchema,
  saveTimetableEntrySchema,
  type CopyPeriodsInput,
  type ImportTimetableBatchInput,
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
import { TimetableImportService } from './timetable-import.service.js';
import { TimetableService } from './timetable.service.js';

const READ = ['owner', 'admin', 'teacher', 'staff'] as const;

@Controller('timetable')
@UseGuards(SchoolTenantGuard, RolesGuard)
export class TimetableController {
  constructor(
    private readonly timetable: TimetableService,
    private readonly imports: TimetableImportService,
  ) {}

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

  /** Current class timetable for the authenticated student. */
  @Get('me')
  @Roles('student')
  myTimetable(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.timetable.getStudentOwnTimetable(school.id, user!.id);
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

  @Post('periods/copy')
  @Roles('owner', 'admin')
  copyPeriods(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(copyPeriodsSchema)) body: CopyPeriodsInput,
  ) {
    return this.timetable.copyPeriods(school.id, body);
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

  // ---- bulk upload ---------------------------------------------------------
  /** Checks an uploaded CSV/XLSX of lessons and returns a row-by-row preview. Saves nothing. */
  @Post('import/preview')
  @Roles('owner', 'admin')
  @Header('Cache-Control', 'no-store')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024, files: 1 } }))
  previewImport(
    @CurrentSchool() school: School,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('academicYearId') academicYearId?: string,
  ) {
    if (!file) throw new BadRequestException('Choose a CSV or XLSX file.');
    return this.imports.preview(school, file, academicYearId);
  }

  /** Saves one batch of previewed rows; each row gets its own created/updated/failed result. */
  @Post('import')
  @Roles('owner', 'admin')
  @Header('Cache-Control', 'no-store')
  importBatch(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(importTimetableBatchSchema)) body: ImportTimetableBatchInput,
  ) {
    return this.imports.importBatch(school, body);
  }

  /** Weekly timetable for a child linked to the authenticated guardian. */
  @Get('guardian/:studentId')
  @Roles('guardian')
  guardianWardTimetable(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param('studentId') studentId: string,
  ) {
    return this.timetable.getGuardianWardTimetable(school.id, user!.id, studentId);
  }

}
