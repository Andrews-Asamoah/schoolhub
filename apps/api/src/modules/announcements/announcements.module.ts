import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { AnnouncementsController } from "./announcements.controller.js";
import { AnnouncementsService } from "./announcements.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [AnnouncementsController],
  providers: [AnnouncementsService, SchoolTenantGuard, RolesGuard],
})
export class AnnouncementsModule {}
