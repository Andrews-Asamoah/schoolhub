import { createFileRoute, redirect } from "@tanstack/react-router";

/**
 * Index route — redirects to /dashboard if logged in, /login if not.
 * The loader runs on the server (or before render) and never renders HTML.
 */
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    // TODO: check auth session; for now redirect to login
    throw redirect({ to: "/login" });
  },
});
