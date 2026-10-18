import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";

/**
 * Sends a signed-in user whose password is still an administrator-issued
 * temporary one to /change-password. This is a UX convenience only - the API
 * independently refuses every tenant request until the password is changed.
 */
export function usePasswordChangeGate(
  user: { mustChangePassword?: boolean | null } | undefined | null,
  isPending: boolean,
) {
  const navigate = useNavigate();
  const mustChange = Boolean(user?.mustChangePassword);

  useEffect(() => {
    if (!isPending && mustChange) {
      void navigate({ to: "/change-password", replace: true });
    }
  }, [isPending, mustChange, navigate]);

  return mustChange;
}
