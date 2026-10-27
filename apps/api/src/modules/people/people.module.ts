import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module.js";
import { PeopleController } from "./people.controller.js";
import { PeopleService } from "./people.service.js";
import { StaffImportController } from "./staff-import.controller.js";
import { StaffImportService } from "./staff-import.service.js";

@Module({
  imports: [AccountsModule],
  controllers: [PeopleController, StaffImportController],
  providers: [PeopleService, StaffImportService],
})
export class PeopleModule {}
