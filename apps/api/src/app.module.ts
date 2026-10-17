import { Module } from "@nestjs/common";
import { APP_FILTER } from "@nestjs/core";
import { AuthModule } from "@thallesp/nestjs-better-auth";
import { auth } from "./auth/auth.js";
import { HealthController } from "./health.controller.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter.js";

// Domain Modules
import { StorageModule } from "./modules/storage/storage.module.js";
import { SchoolsModule } from "./modules/schools/schools.module.js";
import { StudentsModule } from "./modules/students/students.module.js";
import { AcademicsModule } from "./modules/academics/academics.module.js";
import { AttendanceModule } from "./modules/attendance/attendance.module.js";
import { AssessmentsModule } from "./modules/assessments/assessments.module.js";
import { FinanceModule } from "./modules/finance/finance.module.js";
import { SuperAdminModule } from "./modules/super-admin/super-admin.module.js";
import { SupportModule } from "./modules/support/support.module.js";
import { PeopleModule } from "./modules/people/people.module.js";

@Module({
  imports: [
    PrismaModule,
    StorageModule,
    AuthModule.forRoot({ auth }),
    SchoolsModule,
    StudentsModule,
    AcademicsModule,
    AttendanceModule,
    AssessmentsModule,
    FinanceModule,
    SuperAdminModule,
    SupportModule,
    PeopleModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule {}
