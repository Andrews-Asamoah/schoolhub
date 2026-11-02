// Read responses retain legacy audience strings (for example ALL); the server filters their audience.
import {
  ANNOUNCEMENT_STATUSES,
  createAnnouncementSchema,
} from "@schoolhub/shared";
import { z } from "zod";
import { defineEndpoint } from "./endpoint";
export const announcementSchema = createAnnouncementSchema
  .pick({ category: true })
  .extend({
    title: z.string(),
    content: z.string(),
    target: z.string(),
    id: z.string().min(1),
    createdAt: z.iso.datetime(),
    isPinned: z.boolean(),
    status: z.enum(ANNOUNCEMENT_STATUSES),
  });
export type Announcement = z.infer<typeof announcementSchema>;
export const listAnnouncements = defineEndpoint({
  method: "GET",
  path: "/announcements",
  roles: ["teacher", "student", "guardian"],
  response: z.array(announcementSchema),
});
