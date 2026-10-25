import { SetMetadata } from "@nestjs/common";

export const ALLOW_INACTIVE_SUBSCRIPTION = "schoolhub:allow-inactive-subscription";

/**
 * Lets a handler run even when the school's subscription is suspended,
 * cancelled or expired (for example, contacting support about billing).
 */
export const AllowInactiveSubscription = () => SetMetadata(ALLOW_INACTIVE_SUBSCRIPTION, true);
