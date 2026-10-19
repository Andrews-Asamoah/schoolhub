import { Module } from "@nestjs/common";
import { AccountController, AccountsAdminController } from "./accounts.controller.js";
import { MeController } from "./me.controller.js";
import { MeService } from "./me.service.js";
import { AccountsService } from "./accounts.service.js";
import { CredentialsService } from "./credentials.service.js";

@Module({
  controllers: [AccountController, AccountsAdminController, MeController],
  providers: [AccountsService, CredentialsService, MeService],
  exports: [CredentialsService],
})
export class AccountsModule {}
