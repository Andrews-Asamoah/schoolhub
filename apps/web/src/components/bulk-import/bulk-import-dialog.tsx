import type { ComponentProps, ReactNode } from "react";
import { PortalModal } from "@/components/portal/portal-modal";

interface BulkImportDialogProps {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Called when the person dismisses the dialog (close button, Esc or backdrop). */
  onClose: () => void;
  /** When true, dismissing asks for confirmation first. */
  busy?: boolean;
  busyMessage?: string;
  maxWidth?: ComponentProps<typeof PortalModal>["maxWidth"];
}

/**
 * The one dialog shell every bulk upload uses. It is built on PortalModal, which
 * renders into document.body above the sidebar and header, so the dimmed overlay
 * always covers the whole screen no matter where the upload button lives.
 */
export function BulkImportDialog({
  title,
  description,
  children,
  footer,
  onClose,
  busy = false,
  busyMessage = "An upload is still running and cannot be cancelled. Close this window and let it finish in the background?",
  maxWidth = "4xl",
}: BulkImportDialogProps) {
  const dismiss = () => {
    if (busy && !window.confirm(busyMessage)) return;
    onClose();
  };
  return (
    <PortalModal isOpen onClose={dismiss} title={title} description={description} footer={footer} maxWidth={maxWidth}>
      {children}
    </PortalModal>
  );
}
