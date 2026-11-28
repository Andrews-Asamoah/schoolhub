import { z } from "zod";

export const registerSyncDeviceSchema = z.object({
  installationId: z.uuid(),
  name: z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/, "Use a readable device name."),
  platform: z.enum(["windows", "macos", "linux"]),
}).strict();
export type RegisterSyncDeviceInput = z.infer<typeof registerSyncDeviceSchema>;
export const syncDeviceQuerySchema = z.object({
  scope: z.enum(["mine", "school"]).default("mine"),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type SyncDeviceQuery = z.infer<typeof syncDeviceQuerySchema>;
export const revokeSyncDeviceSchema = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
/** Session IDs, credentials and installation IDs never appear in management lists. */
export interface SyncDeviceSummary {
  id: string;
  name: string;
  platform: string;
  clientVersion: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt: string | null;
  owner: { id: string; name: string };
  current: boolean;
}
export interface SyncDevicePage {
  items: SyncDeviceSummary[];
  total: number;
  page: number;
  limit: number;
}
