import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";
import {
  createSessionStore,
  type SessionStorage,
  type SessionEvent,
} from "./session-core";
import { wipeQueryCache } from "./query-client";
import { log } from "./log";

const TOKEN_KEY = "schoolhub.bearer-token";
const SUBDOMAIN_KEY = "schoolhub:subdomain";
const ROLE_KEY = "schoolhub:active-role";
const LOGOUT_MARKER_KEY = "schoolhub:session-disabled";
export const sessionStorage: SessionStorage = {
  async readToken() {
    if ((await AsyncStorage.getItem(LOGOUT_MARKER_KEY)) === "1") {
      await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() =>
        log("session.storage_failed"),
      );
      return null;
    }
    return SecureStore.getItemAsync(TOKEN_KEY);
  },
  async writeToken(token) {
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      await AsyncStorage.removeItem(LOGOUT_MARKER_KEY);
    } else {
      // A nonsecret tombstone prevents restoring an old token if secure-store
      // deletion fails (for example while the device is locked).
      const results = await Promise.allSettled([
        AsyncStorage.setItem(LOGOUT_MARKER_KEY, "1"),
        SecureStore.deleteItemAsync(TOKEN_KEY),
      ]);
      if (results.some((result) => result.status === "rejected"))
        throw new Error("Unable to clear saved credentials.");
    }
  },
  async readContext() {
    const entries = await AsyncStorage.multiGet([SUBDOMAIN_KEY, ROLE_KEY]);
    // Finance scopes are obsolete on this three-role client. Remove legacy data.
    await AsyncStorage.removeItem("schoolhub:accountant-academic-view");
    return {
      subdomain: entries[0]?.[1] ?? null,
      role: entries[1]?.[1] ?? null,
    };
  },
  async writeContext(subdomain, role) {
    await AsyncStorage.multiRemove([SUBDOMAIN_KEY, ROLE_KEY]);
    const entries: [string, string][] = [];
    if (subdomain) entries.push([SUBDOMAIN_KEY, subdomain]);
    if (role) entries.push([ROLE_KEY, role]);
    if (entries.length) await AsyncStorage.multiSet(entries);
  },
};
export const sessionStore = createSessionStore(sessionStorage, async () => {
  await wipeQueryCache();
});
export const useSession = () =>
  useSyncExternalStore(
    sessionStore.subscribe,
    sessionStore.getSnapshot,
    sessionStore.getSnapshot,
  );
export const hydrateSession = sessionStore.hydrate;
export const clearSession = sessionStore.clear;
export const setToken = sessionStore.setToken;
export const setSubdomain = sessionStore.setSubdomain;
export const setActiveRole = sessionStore.selectRole;
export const getToken = () => sessionStore.getSnapshot().token;
export const getSubdomain = () => sessionStore.getSnapshot().subdomain;
export const getActiveRole = () => sessionStore.getSnapshot().activeRole;
export type { SessionEvent };
const listeners = new Set<(event: SessionEvent) => void>();
export function onSessionEvent(listener: (event: SessionEvent) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function emitSessionEvent(event: SessionEvent) {
  void sessionStore
    .handleEvent(event)
    .catch(() => log("session.storage_failed"));
  listeners.forEach((listener) => listener(event));
}
