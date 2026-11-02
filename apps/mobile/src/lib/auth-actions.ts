import { authClient } from "./auth-client";
import { clearSession, getToken } from "./session";
export async function signOut() {
  const token = getToken();
  let cleanupFailed = false;
  // Immediately invalidate the local generation, even if revocation is slow.
  try {
    await clearSession();
  } catch {
    cleanupFailed = true;
  }
  try {
    await authClient.signOut({
      fetchOptions: { auth: { type: "Bearer", token: token ?? "" } },
    });
  } finally {
    if (cleanupFailed)
      throw new Error("Unable to fully clear saved credentials.");
  }
}
