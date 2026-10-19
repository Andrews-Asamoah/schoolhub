import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module.js";
import { FinanceModule } from "../finance/finance.module.js";
import { StudentsModule } from "../students/students.module.js";
import { AdmissionsController, AdmissionsPublicController } from "./admissions.controller.js";
import { AdmissionsService } from "./admissions.service.js";

@Module({
  imports: [AccountsModule, FinanceModule, StudentsModule],
  controllers: [AdmissionsController, AdmissionsPublicController],
  providers: [AdmissionsService],
})
export class AdmissionsModule {}
