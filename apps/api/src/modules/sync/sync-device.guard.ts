import {
  Injectable,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import { SyncDeviceService } from './sync-device.service.js';

/** Run after SchoolTenantGuard; client headers are never device identity. */
@Injectable()
export class SyncDeviceGuard implements CanActivate {
  constructor(private readonly devices: SyncDeviceService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    request.syncDevice = await this.devices.requireBoundDevice(
      request.school?.id,
      request.session?.user?.id,
      request.session?.session?.id,
    );
    return true;
  }
}
