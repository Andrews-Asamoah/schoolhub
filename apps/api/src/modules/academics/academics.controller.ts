import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Body,
  Headers,
  UseGuards,
} from '@nestjs/common';
import { AcademicsService } from './academics.service.js';
import { SchoolTenantGuard } from '../../common/guards/school-tenant.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentSchool } from '../../common/decorators/current-school.decorator.js';
import { CurrentSchoolRole } from '../../common/decorators/current-school-role.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  createClassSchema,
  createClassTeacherAssignmentSchema,
  createClubSchema,
  createDepartmentSchema,
  createEnrollmentSchema,
  createHouseSchema,
  createSubjectSchema,
  addClubMemberSchema,
  updateClassSchema,
  updateClubSchema,
  updateHouseSchema,
  type CreateClassInput,
  type CreateClassTeacherAssignmentInput,
  type CreateClubInput,
  type CreateDepartmentInput,
  type CreateEnrollmentInput,
  type CreateHouseInput,
  type CreateSubjectInput,
  type AddClubMemberInput,
  type UpdateClassInput,
  type UpdateClubInput,
  type UpdateHouseInput,
} from '@schoolhub/shared';
import type { School } from '@prisma/client';
import { TeacherScopeService } from '../../common/scope/teacher-scope.service.js';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../common/decorators/current-user.decorator.js';

@Controller('academics')
@UseGuards(SchoolTenantGuard, RolesGuard)
export class AcademicsController {
  constructor(
    private readonly academicsService: AcademicsService,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  /** Class ids a teacher may see; undefined (no limit) for every other role. */
  private scopeFor(school: School, role?: string, user?: AuthenticatedUser) {
    return role === 'teacher' && user
      ? this.teacherScope.getTaughtClassIds(school.id, user.id)
      : Promise.resolve(undefined);
  }

  @Get('classes')
  @Roles('owner', 'admin', 'teacher', 'staff', 'accountant')
  async listClasses(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Headers('x-academic-year-id') academicYearId?: string,
    @Headers('x-academic-term-id') termId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.academicsService.listClasses(
      school.id,
      academicYearId,
      termId,
      role,
      await this.scopeFor(school, role, user),
    );
  }

  @Get('enrollments')
  @Roles('owner', 'admin', 'teacher', 'staff', 'accountant')
  async listEnrollments(
    @CurrentSchool() school: School,
    @Query('academicYearId') queryAcademicYearId: string | undefined,
    @Query('termId') termId?: string,
    @Query('classId') classId?: string,
    @CurrentSchoolRole() role?: string,
    @Headers('x-academic-year-id') viewAcademicYearId?: string,
    @Headers('x-academic-term-id') viewTermId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.academicsService.listEnrollments(
      school.id,
      queryAcademicYearId ?? viewAcademicYearId,
      termId ?? viewTermId,
      classId,
      role,
      await this.scopeFor(school, role, user),
    );
  }

  @Get('eligible-students')
  @Roles('owner', 'admin', 'staff')
  listEligibleStudents(
    @CurrentSchool() school: School,
    @Query('academicYearId') academicYearId: string,
    @Query('termId') termId: string,
    @Query('search') search?: string,
    @CurrentSchoolRole() role?: string,
  ) {
    return this.academicsService.listEligibleStudents(
      school.id,
      academicYearId,
      termId,
      search,
      role,
    );
  }

  @Post('enrollments')
  @Roles('owner', 'admin', 'staff')
  createEnrollments(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Body(new ZodValidationPipe(createEnrollmentSchema))
    body: CreateEnrollmentInput,
  ) {
    return this.academicsService.createEnrollments(school.id, body, role);
  }

  @Get('teachers')
  @Roles('owner', 'admin')
  listClassTeachers(@CurrentSchool() school: School) {
    return this.academicsService.listClassTeachers(school.id);
  }

  @Post('classes')
  @Roles('owner', 'admin')
  createClass(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createClassSchema)) body: CreateClassInput,
  ) {
    return this.academicsService.createClass(school.id, body);
  }

  @Patch('classes/:id')
  @Roles('owner', 'admin')
  updateClass(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClassSchema)) body: UpdateClassInput,
  ) {
    return this.academicsService.updateClass(school.id, id, body);
  }

  @Get('classes/:id/teacher-assignments')
  @Roles('owner', 'admin', 'teacher', 'staff')
  listClassTeacherAssignments(
    @CurrentSchool() school: School,
    @Param('id') id: string,
  ) {
    return this.academicsService.listClassTeacherAssignments(school.id, id);
  }

  @Post('classes/:id/teacher-assignments')
  @Roles('owner', 'admin')
  assignClassTeacher(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createClassTeacherAssignmentSchema))
    body: CreateClassTeacherAssignmentInput,
  ) {
    return this.academicsService.assignClassTeacher(school.id, id, body);
  }

  @Get('departments')
  @Roles('owner', 'admin', 'teacher', 'staff')
  listDepartments(@CurrentSchool() school: School) {
    return this.academicsService.listDepartments(school.id);
  }

  @Post('departments')
  @Roles('owner', 'admin')
  createDepartment(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createDepartmentSchema))
    body: CreateDepartmentInput,
  ) {
    return this.academicsService.createDepartment(school.id, body);
  }

  @Get('houses')
  @Roles('owner', 'admin', 'staff', 'teacher', 'student', 'guardian')
  listHouses(@CurrentSchool() school: School) {
    return this.academicsService.listHouses(school.id);
  }

  @Post('houses')
  @Roles('owner', 'admin')
  createHouse(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createHouseSchema)) body: CreateHouseInput,
  ) {
    return this.academicsService.createHouse(school.id, body);
  }

  @Patch('houses/:id')
  @Roles('owner', 'admin')
  updateHouse(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateHouseSchema)) body: UpdateHouseInput,
  ) {
    return this.academicsService.updateHouse(school.id, id, body);
  }

  @Get('clubs')
  @Roles('owner', 'admin', 'staff', 'teacher', 'student', 'guardian')
  listClubs(@CurrentSchool() school: School) {
    return this.academicsService.listClubs(school.id);
  }

  @Get('clubs/:id')
  @Roles('owner', 'admin', 'staff', 'teacher', 'student', 'guardian')
  getClub(@CurrentSchool() school: School, @Param('id') id: string) {
    return this.academicsService.getClub(school.id, id);
  }

  @Post('clubs')
  @Roles('owner', 'admin', 'staff')
  createClub(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createClubSchema)) body: CreateClubInput,
  ) {
    return this.academicsService.createClub(school.id, body);
  }

  @Patch('clubs/:id')
  @Roles('owner', 'admin', 'staff')
  updateClub(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateClubSchema)) body: UpdateClubInput,
  ) {
    return this.academicsService.updateClub(school.id, id, body);
  }

  @Delete('clubs/:id')
  @Roles('owner', 'admin', 'staff')
  deleteClub(@CurrentSchool() school: School, @Param('id') id: string) {
    return this.academicsService.deleteClub(school.id, id);
  }

  @Post('clubs/:id/members')
  @Roles('owner', 'admin', 'staff', 'teacher')
  addClubMember(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addClubMemberSchema)) body: AddClubMemberInput,
  ) {
    return this.academicsService.addClubMember(school.id, id, body);
  }

  @Delete('clubs/:id/members/:studentId')
  @Roles('owner', 'admin', 'staff', 'teacher')
  removeClubMember(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Param('studentId') studentId: string,
  ) {
    return this.academicsService.removeClubMember(school.id, id, studentId);
  }

  @Get('classes/:id/students')
  @Roles('owner', 'admin', 'teacher', 'staff', 'accountant')
  async getClassStudents(
    @CurrentSchool() school: School,
    @Param('id') id: string,
    @Query('academicYearId') queryAcademicYearId: string | undefined,
    @Query('termId') termId?: string,
    @CurrentSchoolRole() role?: string,
    @Headers('x-academic-year-id') viewAcademicYearId?: string,
    @Headers('x-academic-term-id') viewTermId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    return this.academicsService.getClassStudents(
      school.id,
      id,
      queryAcademicYearId ?? viewAcademicYearId,
      termId ?? viewTermId,
      role,
      await this.scopeFor(school, role, user),
    );
  }

  @Get('subjects')
  @Roles('owner', 'admin', 'teacher')
  listSubjects(@CurrentSchool() school: School) {
    return this.academicsService.listSubjects(school.id);
  }

  @Post('subjects')
  @Roles('owner', 'admin')
  createSubject(
    @CurrentSchool() school: School,
    @Body(new ZodValidationPipe(createSubjectSchema)) body: CreateSubjectInput,
  ) {
    return this.academicsService.createSubject(school.id, body);
  }
}
