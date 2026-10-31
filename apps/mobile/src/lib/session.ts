import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

/**
 * In-memory session state, mirrored to storage.
 *   - bearer token  -> expo-secure-store (never plain storage)
 *   - school code, active role, accountant academic view -> AsyncStorage (not secrets)
 *
 * Call hydrateSession() once at startup, before the first request.
 */
const TOKEN_KEY = "schoolhub.bearer-token";
const SUBDOMAIN_KEY = "schoolhub:subdomain";
const ROLE_KEY = "schoolhub:active-role";
const ACADEMIC_VIEW_KEY = "schoolhub:accountant-academic-view";

export type AcademicView = { academicYearId: string; termId: string };

type SessionState = {
  token: string | null;
  subdomain: string | null;
  activeRole: string | null;
  academicView: AcademicView | null;
  hydrated: boolean;
};

const state: SessionState = { token: null, subdomain: null, activeRole: null, academicView: null, hydrated: false };

export type SessionEvent =
  | { type: "unauthorized" }
  | { type: "password-change-required" }
  | { type: "subscription-inactive"; reason: string }
  | { type: "two-factor-required"; audience: string };

type Listener = (event: SessionEvent) => void;
const listeners = new Set<Listener>();

export function onSessionEvent(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
export function emitSessionEvent(event: SessionEvent) {
  listeners.forEach((l) => l(event));
}

export async function hydrateSession(): Promise<void> {
  if (state.hydrated) return;
  const [token, entries] = await Promise.all([
    SecureStore.getItemAsync(TOKEN_KEY).catch(() => null),
    AsyncStorage.multiGet([SUBDOMAIN_KEY, ROLE_KEY, ACADEMIC_VIEW_KEY]),
  ]);
  state.token = token;
  state.subdomain = entries[0]?.[1] ?? null;
  state.activeRole = entries[1]?.[1] ?? null;
  const rawView = entries[2]?.[1];
  if (rawView) {
    try {
      const parsed = JSON.parse(rawView) as Partial<AcademicView>;
      if (typeof parsed.academicYearId === "string" && typeof parsed.termId === "string") {
        state.academicView = { academicYearId: parsed.academicYearId, termId: parsed.termId };
      }
    } catch {
      void AsyncStorage.removeItem(ACADEMIC_VIEW_KEY);
    }
  }
  state.hydrated = true;
}

export const getToken = () => state.token;
export const getSubdomain = () => state.subdomain;
export const getActiveRole = () => state.activeRole;
export const getAcademicView = () => state.academicView;

export async function setToken(token: string | null) {
  state.token = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}

export async function setSubdomain(subdomain: string | null) {
  state.subdomain = subdomain ? subdomain.trim().toLowerCase() : null;
  if (state.subdomain) await AsyncStorage.setItem(SUBDOMAIN_KEY, state.subdomain);
  else await AsyncStorage.removeItem(SUBDOMAIN_KEY);
}

export async function setActiveRole(role: string | null) {
  state.activeRole = role;
  if (role) await AsyncStorage.setItem(ROLE_KEY, role);
  else await AsyncStorage.removeItem(ROLE_KEY);
}

export async function setAcademicView(view: AcademicView | null) {
  state.academicView = view;
  if (view) await AsyncStorage.setItem(ACADEMIC_VIEW_KEY, JSON.stringify(view));
  else await AsyncStorage.removeItem(ACADEMIC_VIEW_KEY);
}

/** Clears credentials and role. Keeps the school code so the user can sign back in. */
export async function clearSession() {
  await Promise.all([setToken(null), setActiveRole(null), setAcademicView(null)]);
}
