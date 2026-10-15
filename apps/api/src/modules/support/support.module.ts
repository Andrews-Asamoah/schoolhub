import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { SuperAdminGuard } from "../../common/guards/super-admin.guard.js";
import { SupportController } from "./support.controller.js";
import { SupportService } from "./support.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [SupportController],
  providers: [SupportService, SchoolTenantGuard, RolesGuard, SuperAdminGuard],
})
export class SupportModule {}
