import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { signOut } from "@/lib/auth-client";

const LOGOUT_NOTICE_KEY = "schoolhub-logout-notice";

export function useLogout() {
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function logout() {
    if (isSigningOut) return;

    setIsSigningOut(true);
    setError(null);

    try {
      const result = await signOut();
      if (result.error) {
        setError(result.error.message ?? "Could not sign out. Please try again.");
        setIsSigningOut(false);
        return;
      }

      window.sessionStorage.setItem(
        LOGOUT_NOTICE_KEY,
        "You have been logged out successfully.",
      );
      await navigate({ to: "/login", replace: true });
    } catch {
      setError("Could not sign out. Please try again.");
      setIsSigningOut(false);
    }
  }

  return { error, isSigningOut, logout };
}

export function consumeLogoutNotice() {
  const message = window.sessionStorage.getItem(LOGOUT_NOTICE_KEY);
  if (message) {
    window.sessionStorage.removeItem(LOGOUT_NOTICE_KEY);
  }
  return message;
}
