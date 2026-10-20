import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Query,
  Headers,
  Header,
  Body,
  UseGuards,
} from "@nestjs/common";
import { StudentsService } from "./students.service.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { Roles } from "../../common/decorators/roles.decorator.js";
import { CurrentSchool } from "../../common/decorators/current-school.decorator.js";
import { TeacherScopeService } from "../../common/scope/teacher-scope.service.js";
import { CurrentUser, type AuthenticatedUser } from "../../common/decorators/current-user.decorator.js";
import { CurrentSchoolRole } from "../../common/decorators/current-school-role.decorator.js";
import { ZodValidationPipe } from "../../common/pipes/zod-validation.pipe.js";
import {
  createStudentSchema,
  updateStudentRecordSchema,
  type CreateStudentInput,
  type UpdateStudentInput,
} from "@schoolhub/shared";
import type { School, StudentStatus } from "@prisma/client";

@Controller("students")
@UseGuards(SchoolTenantGuard, RolesGuard)
export class StudentsController {
  constructor(
    private readonly studentsService: StudentsService,
    private readonly teacherScope: TeacherScopeService,
  ) {}

  @Get()
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  async listStudents(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("classId") classId?: string,
    @Query("academicYearId") academicYearId?: string,
    @Query("termId") termId?: string,
    @Headers("x-academic-year-id") viewAcademicYearId?: string,
    @Headers("x-academic-term-id") viewTermId?: string,
    @Query("search") search?: string,
    @Query("status") status?: StudentStatus,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const scopeClassIds =
      role === "teacher" && user
        ? await this.teacherScope.getTaughtClassIds(school.id, user.id)
        : undefined;
    const result = await this.studentsService.listStudents(school.id, {
      scopeClassIds,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      classId,
      academicYearId: academicYearId ?? viewAcademicYearId,
      termId: termId ?? viewTermId,
      search,
      status,
      role,
    });
    return role === "teacher"
      ? { ...result, data: result.data.map((row) => this.studentsService.withoutFinancials(row)) }
      : result;
  }

  /** The signed-in student's own profile. */
  @Get("me")
  @Roles("student")
  myProfile(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.studentsService.getMyProfile(school.id, user!.id);
  }

  /** Children linked to the signed-in parent / guardian. */
  @Get("my-wards")
  @Roles("guardian")
  myWards(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.studentsService.getMyWards(school.id, user!.id);
  }

  @Get("my-wards/:id")
  @Roles("guardian")
  myWard(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
    @Param("id") id: string,
  ) {
    return this.studentsService.getMyWard(school.id, user!.id, id);
  }

  /** The signed-in student's own subjects (inherited from their class). */
  @Get("me/subjects")
  @Roles("student")
  mySubjects(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.studentsService.getMySubjects(school.id, user!.id);
  }

  /** The signed-in student's classmates. */
  @Get("me/classmates")
  @Roles("student")
  myClassmates(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.studentsService.getMyClassmates(school.id, user!.id);
  }

  /** The signed-in student's joined clubs. */
  @Get("me/clubs")
  @Roles("student")
  myClubs(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.studentsService.getMyClubs(school.id, user!.id);
  }

  /** The signed-in student's fee status badge (no fee numbers/amounts exposed). */
  @Get("me/fee-status")
  @Roles("student")
  myFeeStatus(
    @CurrentSchool() school: School,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ) {
    return this.studentsService.getMyFeeStatus(school.id, user!.id);
  }

  /** Profile details (sign-in name and email, class, guardians, subjects). */
  @Get(":id/profile")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  async getStudentProfile(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Param("id") id: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const scopeClassIds =
      role === "teacher" && user
        ? await this.teacherScope.getTaughtClassIds(school.id, user.id)
        : undefined;
    return this.studentsService.getProfileView(school.id, id, scopeClassIds);
  }

  @Get(":id/subjects")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  async getStudentSubjects(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Param("id") id: string,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const scopeClassIds =
      role === "teacher" && user
        ? await this.teacherScope.getTaughtClassIds(school.id, user.id)
        : undefined;
    return this.studentsService.getStudentSubjects(school.id, id, {
      academicYearId,
      termId,
      scopeClassIds,
    });
  }

  @Get(":id")
  @Roles("owner", "admin", "teacher", "staff", "accountant")
  async getStudentById(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @Param("id") id: string,
    @Headers("x-academic-year-id") academicYearId?: string,
    @Headers("x-academic-term-id") termId?: string,
    @CurrentUser() user?: AuthenticatedUser,
  ) {
    const scopeClassIds =
      role === "teacher" && user
        ? await this.teacherScope.getTaughtClassIds(school.id, user.id)
        : undefined;
    const student = await this.studentsService.getStudentById(
      school.id,
      id,
      role,
      academicYearId,
      termId,
      scopeClassIds,
    );
    return role === "teacher" ? this.studentsService.withoutFinancials(student) : student;
  }

  @Post()
  @Roles("owner", "admin", "staff")
  @Header("Cache-Control", "no-store") // response carries one-time passwords
  createStudent(
    @CurrentSchool() school: School,
    @CurrentSchoolRole() role: string | undefined,
    @CurrentUser() actor: AuthenticatedUser | undefined,
    @Body(new ZodValidationPipe(createStudentSchema)) body: CreateStudentInput,
  ) {
    return this.studentsService.createStudent(school, actor!.id, body, { role });
  }

  @Patch(":id")
  @Roles("owner", "admin", "staff")
  updateStudent(
    @CurrentSchool() school: School,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStudentRecordSchema)) body: UpdateStudentInput,
  ) {
    return this.studentsService.updateStudent(school.id, id, body);
  }

  @Delete(":id")
  @Roles("owner", "admin")
  deleteStudent(
    @CurrentSchool() school: School,
    @Param("id") id: string,
  ) {
    return this.studentsService.deleteStudent(school.id, id);
  }
}
