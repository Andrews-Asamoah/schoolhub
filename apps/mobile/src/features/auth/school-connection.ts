import { ApiError } from "@/lib/api-error";
import { API_ORIGIN } from "@/lib/config";
import { authFailureMessage } from "./forms";
import { SchoolLookupTimeout } from "./school-access";

function apiAddress(value: string) {
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== "/" ||
      url.search ||
      url.hash
    )
      return null;
    return url;
  } catch {
    return null;
  }
}

export function schoolConnectionProblem(
  origin: string,
  physicalAndroid: boolean,
) {
  const url = apiAddress(origin);
  if (!url)
    return "Set EXPO_PUBLIC_API_URL to the SchoolHub API origin without /api, then restart Expo.";
  if (physicalAndroid && url.hostname === "10.0.2.2") {
    return "This app is using the Android emulator address (10.0.2.2). Set EXPO_PUBLIC_API_URL to your laptop’s Wi-Fi IPv4 address and API port, then restart Expo.";
  }
  return "";
}

export function schoolLookupFailure(
  failure: unknown,
  development = __DEV__,
  origin = API_ORIGIN,
) {
  if (failure instanceof ApiError && failure.status === 404) {
    return development
      ? "The server replied, but the school lookup route was not found. Check the API address and restart the API on the latest dev branch."
      : "School lookup is unavailable on this server. Contact SchoolHub support.";
  }
  const timeout = failure instanceof SchoolLookupTimeout;
  const url = development ? apiAddress(origin) : null;
  if (url && (timeout || failure instanceof TypeError)) {
    return `Couldn’t reach the school lookup at ${url.origin}. Open ${url.origin}/api/health/live in your phone’s browser to check the API connection.`;
  }
  if (timeout)
    return "The school lookup timed out. Check your connection and try again.";
  return authFailureMessage(failure, "school");
}
