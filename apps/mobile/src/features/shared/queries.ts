import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  getCurrentAcademicContext,
  getCurrentSession,
  getMyProfile,
  getNotificationPreferences,
  listDeliveryHistory,
  listInboxPage,
  listMessageRecipients,
  listNotificationHistory,
  listNotifications,
  listSentPage,
  type NotificationHistoryOptions,
} from "@/api/shared";
import { isMobileRole, type MobileRole } from "@/lib/permissions";
import { useSession } from "@/lib/session";

type Scope = {
  school: string | null;
  role: MobileRole | null;
};

function useScope(): Scope & { enabled: boolean } {
  const session = useSession();
  return {
    school: session.subdomain,
    role: isMobileRole(session.activeRole) ? session.activeRole : null,
    enabled: session.status === "ready" && isMobileRole(session.activeRole),
  };
}

export const sharedKeys = {
  root: (scope: Scope) =>
    ["school", scope.school, scope.role, "shared"] as const,
  notifications: (scope: Scope) =>
    [...sharedKeys.root(scope), "notifications"] as const,
  notificationHistory: (scope: Scope, options: NotificationHistoryOptions) =>
    [...sharedKeys.root(scope), "notification-history", options] as const,
  preferences: (scope: Scope) =>
    [...sharedKeys.root(scope), "notification-preferences"] as const,
  deliveryHistory: (scope: Scope) =>
    [...sharedKeys.root(scope), "delivery-history"] as const,
  messages: (scope: Scope, folder: "inbox" | "sent") =>
    [...sharedKeys.root(scope), "messages", folder] as const,
  recipients: (scope: Scope, search: string) =>
    [...sharedKeys.root(scope), "message-recipients", search] as const,
  profile: (scope: Scope) => [...sharedKeys.root(scope), "profile"] as const,
  academicContext: (scope: Scope) =>
    [...sharedKeys.root(scope), "academic-context"] as const,
};

export function useNotificationsQuery() {
  const scope = useScope();
  return useQuery({
    queryKey: sharedKeys.notifications(scope),
    queryFn: ({ signal }) => listNotifications({ signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}

export function useNotificationHistoryQuery(
  options: NotificationHistoryOptions = {},
) {
  const scope = useScope();
  return useQuery({
    queryKey: sharedKeys.notificationHistory(scope, options),
    queryFn: ({ signal }) => listNotificationHistory({ ...options, signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}

export function useNotificationPreferencesQuery() {
  const scope = useScope();
  return useQuery({
    queryKey: sharedKeys.preferences(scope),
    queryFn: ({ signal }) => getNotificationPreferences({ signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}

export function useDeliveryHistoryQuery() {
  const scope = useScope();
  return useQuery({
    queryKey: sharedKeys.deliveryHistory(scope),
    queryFn: ({ signal }) => listDeliveryHistory({ signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}

export function useMessagesQuery(folder: "inbox" | "sent", search = "") {
  const scope = useScope();
  return useInfiniteQuery({
    queryKey: [...sharedKeys.messages(scope, folder), search],
    initialPageParam: null as string | null,
    queryFn: ({ signal, pageParam }) =>
      (folder === "inbox" ? listInboxPage : listSentPage)({
        signal,
        query: { cursor: pageParam, search, limit: 30 },
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    select: (data) => data.pages.flatMap((page) => page.items),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}

export function useMessageRecipientsQuery(search: string) {
  const scope = useScope();
  return useQuery({
    queryKey: sharedKeys.recipients(scope, search),
    queryFn: ({ signal }) => listMessageRecipients(search, { signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}

export function useMyProfileQuery() {
  const scope = useScope();
  return useQuery({
    queryKey: sharedKeys.profile(scope),
    queryFn: async ({ signal }) => {
      const [session, profile] = await Promise.all([
        getCurrentSession({ signal }),
        getMyProfile({ signal }),
      ]);
      return { session, profile };
    },
    enabled: scope.enabled,
    meta: { persist: false },
  });
}

export function useAcademicContextQuery() {
  const scope = useScope();
  return useQuery({
    queryKey: sharedKeys.academicContext(scope),
    queryFn: ({ signal }) => getCurrentAcademicContext({ signal }),
    enabled: scope.enabled,
    meta: { persist: false },
  });
}
