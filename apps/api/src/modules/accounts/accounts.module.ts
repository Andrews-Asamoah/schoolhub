import { Module } from "@nestjs/common";
import { AccountController, AccountsAdminController } from "./accounts.controller.js";
import { AccountsService } from "./accounts.service.js";
import { CredentialsService } from "./credentials.service.js";

@Module({
  controllers: [AccountController, AccountsAdminController],
  providers: [AccountsService, CredentialsService],
  exports: [CredentialsService],
})
export class AccountsModule {}
