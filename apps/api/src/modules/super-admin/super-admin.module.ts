import { Module } from "@nestjs/common";
import { SuperAdminController } from "./super-admin.controller.js";
import { SuperAdminService } from "./super-admin.service.js";
import { AccountsModule } from "../accounts/accounts.module.js";
import { PrismaModule } from "../../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule, AccountsModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
