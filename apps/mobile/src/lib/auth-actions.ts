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
    const result = await authClient.signOut({
      fetchOptions: { auth: { type: "Bearer", token: token ?? "" } },
    });
    if (result.error) throw new Error("Unable to revoke the server session.");
  } finally {
    if (cleanupFailed)
      throw new Error("Unable to fully clear saved credentials.");
  }
}
