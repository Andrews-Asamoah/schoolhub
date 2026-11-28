import { Module } from '@nestjs/common';
import { SyncDeviceController } from './sync-device.controller.js';
import { SyncDeviceService } from './sync-device.service.js';
import { SyncDeviceGuard } from './sync-device.guard.js';
@Module({
  controllers: [SyncDeviceController],
  providers: [SyncDeviceService, SyncDeviceGuard],
  exports: [SyncDeviceGuard],
})
export class SyncModule {}
