import { PortalWorkQueueService } from "./portal-work-queue.service.js";
import { Module } from "@nestjs/common";
import { DashboardController } from "./dashboard.controller.js";
import { DashboardService } from "./dashboard.service.js";

@Module({
  controllers: [DashboardController],
  providers: [DashboardService, PortalWorkQueueService],
})
export class DashboardModule {}
