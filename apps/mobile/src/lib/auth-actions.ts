import { authClient } from "./auth-client";
import { clearSession } from "./session";
export async function signOut() {
  try {
    await authClient.signOut();
  } finally {
    await clearSession();
  }
}
