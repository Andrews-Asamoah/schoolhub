import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";

const TicketWorkspace = lazy(() => import("@/components/support/ticket-workspace").then((module) => ({ default: module.TicketWorkspace })));

export const Route = createFileRoute("/admin/support")({
  component: PlatformSupportPage,
});

function PlatformSupportPage() {
  return <Suspense fallback={<p role="status">Loading support…</p>}><TicketWorkspace mode="platform" /></Suspense>;
}
