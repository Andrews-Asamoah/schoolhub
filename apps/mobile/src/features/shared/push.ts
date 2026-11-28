import Constants from "expo-constants";
import * as Device from "expo-device";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { z } from "zod";
import { registerPushDevice, removePushDevice } from "@/api/shared";
import { isAuthorizedSession } from "@/lib/permissions";
import { queryClient } from "@/lib/query-client";
import { sessionStore, useSession } from "@/lib/session";
import { sharedKeys } from "./queries";

const channelId = "schoolhub-updates";
type Notifications = typeof import("expo-notifications");
type PushResponse = import("expo-notifications").NotificationResponse;

export const supportsSchoolPush =
  (Platform.OS === "android" || Platform.OS === "ios") &&
  Device.isDevice &&
  Constants.executionEnvironment !== "storeClient";

let registration: { revision: number; id: string; token: string } | null = null;
let operation: Promise<unknown> = Promise.resolve();
function ordered<T>(task: () => Promise<T>) {
  const next = operation.then(task, task);
  operation = next.catch(() => undefined);
  return next;
}

const pushData = z.object({
  screen: z.literal("school-updates"),
  registrationId: z.string().regex(/^[a-f0-9]{64}$/),
});

function acceptsPush(data: unknown) {
  const parsed = pushData.safeParse(data);
  return (
    parsed.success &&
    registration?.id === parsed.data.registrationId &&
    registration.revision === sessionStore.getRevision() &&
    isAuthorizedSession(sessionStore.getSnapshot())
  );
}

async function register(
  notifications: Notifications,
  revision: number,
  prompt: boolean,
) {
  const current = () =>
    sessionStore.getRevision() === revision &&
    isAuthorizedSession(sessionStore.getSnapshot());
  if (!current()) return false;

  if (Platform.OS === "android")
    await notifications.setNotificationChannelAsync(channelId, {
      name: "School updates",
      importance: notifications.AndroidImportance.DEFAULT,
    });
  let permission = await notifications.getPermissionsAsync();
  if (prompt && !permission.granted && permission.canAskAgain)
    permission = await notifications.requestPermissionsAsync();
  if (!current()) return false;
  if (!permission.granted) {
    await unregisterSchoolPush();
    return false;
  }
  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  if (typeof projectId !== "string" || !projectId)
    throw new Error("Push project is unavailable.");
  const token = (await notifications.getExpoPushTokenAsync({ projectId })).data;
  if (!current()) return false;
  if (registration?.revision === revision && registration.token === token)
    return true;
  const previous = registration?.revision === revision ? registration : null;
  const result = await registerPushDevice({ request: { token } });
  if (!current()) return false;
  registration = { revision, id: result.registrationId, token };
  if (previous && previous.id !== result.registrationId)
    await removePushDevice({ request: { registrationId: previous.id } }).catch(
      () => undefined,
    );
  return true;
}

export function unregisterSchoolPush() {
  // Start the guarded request before sign-out or a role switch changes headers.
  const current = registration;
  registration = null;
  if (!current || current.revision !== sessionStore.getRevision())
    return Promise.resolve();
  return removePushDevice({ request: { registrationId: current.id } }).then(
    () => undefined,
  );
}

export function enableSchoolPush() {
  if (!supportsSchoolPush) return Promise.resolve(false);
  const revision = sessionStore.getRevision();
  return ordered(async () =>
    register(await import("expo-notifications"), revision, true),
  );
}

export function useSchoolPush(openUpdates: () => void) {
  const session = useSession();
  const revision = sessionStore.getRevision();
  useEffect(() => {
    if (!supportsSchoolPush || !isAuthorizedSession(session)) return;
    let active = true;
    let detach = () => {};
    const handleResponse = (response: PushResponse) => {
      if (!active || !acceptsPush(response.notification.request.content.data))
        return;
      void queryClient.invalidateQueries({
        queryKey: sharedKeys.notifications({
          school: session.subdomain,
          role: session.activeRole,
        }),
      });
      openUpdates();
    };
    void import("expo-notifications")
      .then((notifications) => {
        if (!active) return;
        notifications.setNotificationHandler({
          handleNotification: async (notification) => {
            const show = acceptsPush(notification.request.content.data);
            return {
              shouldShowBanner: show,
              shouldShowList: show,
              shouldPlaySound: false,
              shouldSetBadge: false,
            };
          },
        });
        const sync = () =>
          ordered(() => register(notifications, revision, false)).catch(
            () => false,
          );
        const foreground = AppState.addEventListener("change", (state) => {
          if (state === "active") void sync();
        });
        const tokenChanged = notifications.addPushTokenListener(
          () => void sync(),
        );
        const tapped = notifications.addNotificationResponseReceivedListener(
          (response) => {
            handleResponse(response);
            if (acceptsPush(response.notification.request.content.data))
              notifications.clearLastNotificationResponse();
          },
        );
        detach = () => {
          foreground.remove();
          tokenChanged.remove();
          tapped.remove();
        };
        void sync().then((enabled) => {
          if (!active || !enabled) return;
          const last = notifications.getLastNotificationResponse();
          if (last) {
            handleResponse(last);
            notifications.clearLastNotificationResponse();
          }
        });
      })
      .catch(() => undefined);
    return () => {
      active = false;
      detach();
    };
  }, [session, revision, openUpdates]);
}
