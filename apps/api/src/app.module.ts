import { PasswordRecoveryModule } from "./modules/accounts/password-recovery/password-recovery.module.js";
import { SyncModule } from "./modules/sync/sync.module.js";
import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { TenantThrottlerGuard } from "./common/guards/tenant-throttler.guard.js";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth/auth.js";
import { HealthController } from "./health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js";

import { JobsModule } from "./common/jobs/jobs.module.js";

// Domain Modules
import { StorageModule } from "./modules/storage/storage.module.js";
import { SchoolsModule } from "./modules/schools/schools.module.js";
import { StudentsModule } from "./modules/students/students.module.js";
import { StudentDeletionModule } from "./modules/student-deletion/student-deletion.module.js";
import { AcademicsModule } from "./modules/academics/academics.module.js";
import { AttendanceModule } from "./modules/attendance/attendance.module.js";
import { TeachingModule } from "./modules/teaching/teaching.module.js";
import { AssessmentsModule } from "./modules/assessments/assessments.module.js";
import { FinanceModule } from "./modules/finance/finance.module.js";
import { SuperAdminModule } from "./modules/super-admin/super-admin.module.js";
import { SupportModule } from "./modules/support/support.module.js";
import { TeacherScopeModule } from "./common/scope/teacher-scope.service.js";
import { SubjectsModule } from "./modules/subjects/subjects.module.js";
import { TimetableModule } from "./modules/timetable/timetable.module.js";
import { AccountsModule } from "./modules/accounts/accounts.module.js";
import { PeopleModule } from "./modules/people/people.module.js";
import { AdmissionsModule } from "./modules/admissions/admissions.module.js";
import { AnnouncementsModule } from "./modules/announcements/announcements.module.js";
import { NotificationsModule } from "./modules/notifications/notifications.module.js";
import { DocumentsModule } from "./modules/documents/documents.module.js";
import { MessagesModule } from "./modules/messages/messages.module.js";
import { AssignmentsModule } from "./modules/assignments/assignments.module.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";
import { DashboardModule } from "./modules/dashboard/dashboard.module.js";

@Module({
  imports: [
    // Default limit for every route (TenantThrottlerGuard, below). Buckets are per tenant and user,
    // not per IP, because many pupils share one school IP address. Sensitive controllers keep their
    // own stricter @Throttle rules.
    ThrottlerModule.forRoot([{ name: "default", ttl: 60_000, limit: 120 }]),
    PrismaModule,
    JobsModule,
    StorageModule,
    // Bounded payloads for reviewed rollover batches (up to 2,000 decisions).
    AuthModule.forRoot({
      auth,
      // Browser CORS is enforced by originPolicy in main.ts. The Better Auth
      // origin callback separately validates scoped native challenge requests.
      disableTrustedOriginsCors: true,
      bodyParser: { rawBody: true, json: { limit: "4mb" } },
    }),
    SchoolsModule,
    StudentsModule,
    StudentDeletionModule,
    AcademicsModule,
    AttendanceModule,
    TeachingModule,
    AssessmentsModule,
    FinanceModule,
    SuperAdminModule,
    SupportModule,
    PeopleModule,
    AccountsModule,
    PasswordRecoveryModule,
    TeacherScopeModule,
    SubjectsModule,
    TimetableModule,
    AdmissionsModule,
    AnnouncementsModule,
    NotificationsModule,
    DocumentsModule,
    MessagesModule,
    AssignmentsModule,
    InventoryModule,
    DashboardModule,
    SyncModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
    { provide: APP_GUARD, useClass: TenantThrottlerGuard },
  ],
})
export class AppModule {}
