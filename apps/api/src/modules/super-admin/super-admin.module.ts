import { Module } from "@nestjs/common";
import { SuperAdminController } from "./super-admin.controller.js";
import { SuperAdminService } from "./super-admin.service.js";
import { PrismaModule } from "../../prisma/prisma.module.js";

@Module({
  imports: [PrismaModule],
  controllers: [SuperAdminController],
  providers: [SuperAdminService],
})
export class SuperAdminModule {}
