import { Module } from "@nestjs/common";
import { AccountsModule } from "../accounts/accounts.module.js";
import { PeopleController } from "./people.controller.js";
import { PeopleService } from "./people.service.js";

@Module({
  imports: [AccountsModule],
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
