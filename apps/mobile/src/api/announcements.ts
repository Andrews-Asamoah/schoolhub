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

const teacherAnnouncementRequest = createAnnouncementSchema
  .pick({ title: true, content: true, category: true })
  .extend({
    target: z.enum(["SELECTED_CLASSES", "SELECTED_CLASS_GUARDIANS"]),
    classIds: z.array(z.string().trim().min(1)).min(1).max(100),
  });

export const listAnnouncementClasses = defineEndpoint({
  method: "GET",
  path: "/announcements/classes",
  roles: ["teacher"],
  response: z.array(z.object({ id: z.string().min(1), name: z.string() })),
});

export const publishClassAnnouncement = defineEndpoint({
  method: "POST",
  path: "/announcements",
  roles: ["teacher"],
  request: teacherAnnouncementRequest,
  response: announcementSchema,
});
