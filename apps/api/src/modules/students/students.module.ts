import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module.js";
import { StudentImportController } from "./import/student-import.controller.js";
import { StudentImportService } from "./import/student-import.service.js";
import { StudentsController } from "./students.controller.js";
import { StudentsService } from "./students.service.js";

@Module({
  imports: [AccountsModule],
  controllers: [StudentsController, StudentImportController],
  providers: [StudentsService, StudentImportService],
  exports: [StudentsService],
})
export class StudentsModule {}
