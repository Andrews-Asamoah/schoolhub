import { Module } from "@nestjs/common";
import { StudentDeletionAdminController } from "./student-deletion-admin.controller.js";
import { StudentDeletionController } from "./student-deletion.controller.js";
import { StudentDeletionService } from "./student-deletion.service.js";

@Module({
  controllers: [StudentDeletionController, StudentDeletionAdminController],
  providers: [StudentDeletionService],
})
export class StudentDeletionModule {}
