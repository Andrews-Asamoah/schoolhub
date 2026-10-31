import { SchoolSmsModule } from "./school-sms.module.js";
import { NotificationDeliveryAdminGuard, NotificationDeliveryController, ResendWebhookController } from "./delivery.controller.js";
import { NotificationDeliveryService, NotificationTransport } from "./delivery.service.js";
import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module.js";
import { RolesGuard } from "../../common/guards/roles.guard.js";
import { SchoolTenantGuard } from "../../common/guards/school-tenant.guard.js";
import { NotificationsController } from "./notifications.controller.js";
import { NotificationsService } from "./notifications.service.js";

@Module({
  imports: [PrismaModule, SchoolSmsModule],
  controllers: [NotificationDeliveryController, ResendWebhookController, NotificationsController],
  providers: [NotificationDeliveryAdminGuard, NotificationDeliveryService, NotificationTransport, NotificationsService, SchoolTenantGuard, RolesGuard],
})
export class NotificationsModule {}