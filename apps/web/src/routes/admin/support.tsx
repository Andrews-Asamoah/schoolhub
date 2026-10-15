import { createFileRoute } from "@tanstack/react-router";
import { TicketWorkspace } from "@/components/support/ticket-workspace";

export const Route = createFileRoute("/admin/support")({
  component: PlatformSupportPage,
});

function PlatformSupportPage() {
  return <TicketWorkspace mode="platform" />;
}
