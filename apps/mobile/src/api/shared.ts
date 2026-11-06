import { updateMyProfileSchema } from "@schoolhub/shared";
import { z } from "zod";
import { defineEndpoint, defineUpload } from "./endpoint";

const dateTime = z.iso.datetime();
const actionResponseSchema = z.object({ success: z.boolean() });

export const notificationSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  link: z.string().nullable().optional(),
  isRead: z.boolean(),
  createdAt: dateTime,
});
export type SchoolNotification = z.infer<typeof notificationSchema>;

const notificationListSchema = z.object({
  items: z.array(notificationSchema),
  unreadCount: z.number().int().nonnegative(),
});
const notificationHistorySchema = notificationListSchema.extend({
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  totalPages: z.number().int().nonnegative(),
});
const notificationHistoryOptionsSchema = z.object({
  search: z.string().max(100).optional(),
  status: z.enum(["ALL", "READ", "UNREAD"]).optional(),
  page: z.number().int().positive().optional(),
  limit: z.number().int().positive().max(100).optional(),
});
export type NotificationHistoryOptions = z.input<
  typeof notificationHistoryOptionsSchema
> & { signal?: AbortSignal };

export const listNotifications = defineEndpoint({
  method: "GET",
  path: "/notifications",
  roles: ["teacher", "student", "guardian"],
  response: notificationListSchema,
});
const listNotificationHistoryEndpoint = defineEndpoint({
  method: "GET",
  path: "/notifications/history",
  roles: ["teacher", "student", "guardian"],
  response: notificationHistorySchema,
});
export function listNotificationHistory(
  options: NotificationHistoryOptions = {},
) {
  const { signal, ...filters } = options;
  const parsed = notificationHistoryOptionsSchema.parse(filters);
  return listNotificationHistoryEndpoint({ query: parsed, signal });
}
export const markNotificationRead = defineEndpoint({
  method: "PATCH",
  path: "/notifications/:id/read",
  roles: ["teacher", "student", "guardian"],
  response: actionResponseSchema,
});
export const markAllNotificationsRead = defineEndpoint({
  method: "PATCH",
  path: "/notifications/read-all",
  roles: ["teacher", "student", "guardian"],
  response: z.object({
    success: z.boolean(),
    updatedCount: z.number().int().nonnegative(),
  }),
});

const preferencesSchema = z.object({
  emailEnabled: z.boolean(),
  smsEnabled: z.boolean(),
});
export type NotificationPreferences = z.infer<typeof preferencesSchema>;
export const getNotificationPreferences = defineEndpoint({
  method: "GET",
  path: "/notifications/delivery/preferences",
  roles: ["teacher", "student", "guardian"],
  response: preferencesSchema,
});
export const updateNotificationPreferences = defineEndpoint({
  method: "PATCH",
  path: "/notifications/delivery/preferences",
  roles: ["teacher", "student", "guardian"],
  request: preferencesSchema,
  response: preferencesSchema,
});

const deliverySchema = z.object({
  id: z.string(),
  channel: z.string(),
  provider: z.string().nullable(),
  status: z.string(),
  attempts: z.number().int().nonnegative(),
  reason: z.string().nullable(),
  createdAt: dateTime,
  updatedAt: dateTime,
  acceptedAt: dateTime.nullable(),
  deliveredAt: dateTime.nullable(),
});
export const listDeliveryHistory = defineEndpoint({
  method: "GET",
  path: "/notifications/delivery/history",
  roles: ["teacher", "student", "guardian"],
  response: z.object({
    items: z.array(deliverySchema),
    total: z.number().int().nonnegative(),
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
  }),
});

const messagePersonSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable().optional(),
});
const messageDeliveryRecipientSchema = z.object({
  id: z.string().optional(),
  recipientId: z.string().optional(),
  isRead: z.boolean().optional(),
  readAt: dateTime.nullable().optional(),
  recipient: messagePersonSchema.optional(),
});
export const schoolMessageSchema = z.object({
  id: z.string().min(1),
  subject: z.string(),
  body: z.string(),
  createdAt: dateTime,
  sender: messagePersonSchema,
  recipients: z.array(messageDeliveryRecipientSchema),
});
export type SchoolMessage = z.infer<typeof schoolMessageSchema>;

export const listInboxMessages = defineEndpoint({
  method: "GET",
  path: "/messages/inbox",
  roles: ["teacher", "student", "guardian"],
  response: z.array(schoolMessageSchema),
});
export const listSentMessages = defineEndpoint({
  method: "GET",
  path: "/messages/sent",
  roles: ["teacher", "student", "guardian"],
  response: z.array(schoolMessageSchema),
});
export const messageRecipientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  image: z.string().nullable().optional(),
  role: z.string(),
  roles: z.array(z.string()),
});
const listMessageRecipientsEndpoint = defineEndpoint({
  method: "GET",
  path: "/messages/recipients",
  roles: ["teacher", "student", "guardian"],
  response: z.array(messageRecipientSchema),
});
export function listMessageRecipients(
  search?: string,
  options: { signal?: AbortSignal } = {},
) {
  return listMessageRecipientsEndpoint({ query: { search }, ...options });
}
export const sendMessageSchema = z.object({
  recipientIds: z.array(z.string().trim().min(1)).min(1).max(25),
  subject: z.string().trim().min(2).max(160),
  body: z.string().trim().min(1).max(10_000),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export const sendMessage = defineEndpoint({
  method: "POST",
  path: "/messages",
  roles: ["teacher", "student", "guardian"],
  request: sendMessageSchema,
  response: schoolMessageSchema,
});
export const markMessageRead = defineEndpoint({
  method: "PATCH",
  path: "/messages/:id/read",
  roles: ["teacher", "student", "guardian"],
  response: actionResponseSchema,
});

const sessionSchema = z
  .object({
    user: z
      .object({
        id: z.string(),
        name: z.string().optional(),
        email: z.string().optional(),
        image: z.string().nullable().optional(),
      })
      .passthrough(),
  })
  .passthrough();
export const getCurrentSession = defineEndpoint({
  method: "GET",
  path: "/me",
  roles: [],
  scope: "session",
  response: sessionSchema,
});

const myProfileSchema = z.object({
  user: z.object({
    name: z.string(),
    email: z.string(),
    image: z.string().nullable(),
  }),
  username: z.string().nullable(),
  profile: z.object({
    firstName: z.string(),
    lastName: z.string(),
    otherNames: z.string().nullable(),
    phone: z.string().nullable(),
    alternatePhone: z.string().nullable(),
    residentialAddress: z.string().nullable(),
    city: z.string().nullable(),
    region: z.string().nullable(),
    emergencyContactName: z.string().nullable(),
    emergencyContactPhone: z.string().nullable(),
    emergencyRelationship: z.string().nullable(),
  }),
  canEditName: z.boolean(),
});
export type MyProfile = z.infer<typeof myProfileSchema>;
export const getMyProfile = defineEndpoint({
  method: "GET",
  path: "/schools/current/me/profile",
  roles: ["teacher", "student", "guardian"],
  scope: "tenant",
  response: myProfileSchema,
});
export const updateMyProfile = defineEndpoint({
  method: "PATCH",
  path: "/schools/current/me/profile",
  roles: ["teacher", "student", "guardian"],
  scope: "tenant",
  request: updateMyProfileSchema,
  response: myProfileSchema,
});
export const uploadMyAvatar = defineUpload({
  method: "PUT",
  path: "/schools/current/me/avatar",
  roles: ["teacher", "guardian"],
  scope: "tenant",
  field: "avatar",
  response: z.object({ image: z.string().url() }),
});
export const removeMyAvatar = defineEndpoint({
  method: "DELETE",
  path: "/schools/current/me/avatar",
  roles: ["teacher", "guardian"],
  scope: "tenant",
  response: z.object({ image: z.null() }),
});

const academicContextSchema = z
  .object({
    academicYear: z
      .object({
        id: z.string(),
        name: z.string().optional(),
        startDate: dateTime.optional(),
        endDate: dateTime.optional(),
      })
      .passthrough(),
    term: z
      .object({
        id: z.string(),
        name: z.string(),
        startDate: dateTime.optional(),
        endDate: dateTime.optional(),
      })
      .passthrough(),
  })
  .nullable();
export type CurrentAcademicContext = z.infer<typeof academicContextSchema>;
export const getCurrentAcademicContext = defineEndpoint({
  method: "GET",
  path: "/schools/academic-context",
  roles: ["teacher", "student", "guardian"],
  scope: "tenant",
  response: academicContextSchema,
});
