import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { MessagesController } from "./messages.controller.js";
import { MessagesService } from "./messages.service.js";

@Module({
  imports: [PrismaModule],
  controllers: [MessagesController],
  providers: [MessagesService, SchoolTenantGuard, RolesGuard],
})
export class MessagesModule {}
