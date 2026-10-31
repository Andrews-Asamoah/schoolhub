import { createRootRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { ThemeProvider } from "@/components/theme-provider";
import { usePasswordChangeGate } from "@/hooks/use-password-gate";
import { useSession } from "@/lib/auth-client";

/** Root route outlet; feature routes own their page layouts. */
export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { data: session, isPending } = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  // One place guards every screen: a temporary password must be replaced first.
  const onChangePasswordPage = ["/change-password", "/forgot-password", "/reset-password"].includes(pathname);
  usePasswordChangeGate(
    onChangePasswordPage ? null : session?.user,
    isPending,
  );

  return (
    <ThemeProvider>
      <Outlet />
    </ThemeProvider>
  );
}
