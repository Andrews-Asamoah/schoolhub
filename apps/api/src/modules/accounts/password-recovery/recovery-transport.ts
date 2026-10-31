import { Injectable } from '@nestjs/common';
import { DeliveryProvider } from '../../notifications/delivery-provider.js';
@Injectable()
export class RecoveryTransport extends DeliveryProvider {
  constructor() {
    super();
  }
}
