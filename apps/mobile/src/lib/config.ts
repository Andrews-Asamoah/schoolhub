const origin = (process.env.EXPO_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

if (!origin && __DEV__) {
  console.warn("EXPO_PUBLIC_API_URL is not set. Copy .env.example to .env and set it.");
}

/** API origin without the /api suffix (Better Auth appends its own base path). */
export const API_ORIGIN = origin;
/** Prefix every business endpoint lives under (the API sets a global "api" prefix). */
export const API_BASE = `${origin}/api`;
export const AUTH_BASE_PATH = "/api/auth";
