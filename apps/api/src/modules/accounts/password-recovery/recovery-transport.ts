import { Injectable } from '@nestjs/common';
import { DeliveryProvider } from '../../notifications/delivery-provider.js';
@Injectable()
export class RecoveryTransport extends DeliveryProvider {
  // Account recovery is explicitly requested security mail, independent of
  // school broadcast consent, quotas, switches and delivery webhooks.
  override configured(channel: string) {
    return channel === 'EMAIL' && this.emailConfigured();
  }
  constructor() {
    super();
  }
}
