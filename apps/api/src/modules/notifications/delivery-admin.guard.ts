import {
  Injectable,
  ForbiddenException,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
// The shared RolesGuard deliberately lets headteachers inherit admin permissions.
// Delivery spending controls and school-wide history require an explicit owner/admin role.
@Injectable()
export class NotificationDeliveryAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    if(request.session?.user?.role === 'superAdmin') return true;
    const declared=String(request.membership?.role??'').split(',').map(role=>role.trim());
    const active=request.schoolRole??request.membership?.role;
    if(['owner','admin'].includes(active)&&declared.some(role=>['owner','admin'].includes(role)))return true;
    throw new ForbiddenException(
      'School owner or administrator access required.',
    );
  }
}
