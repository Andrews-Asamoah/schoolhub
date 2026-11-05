import { useEffect, useId, type ComponentProps, type ReactNode } from "react";
import { FormCancelButton, FormSubmitButton } from "@/components/forms/form-controls";
import { PortalModal } from "@/components/portal/portal-modal";

interface FormModalProps {
  title: string;
  description?: string;
  /** Closes the modal. Ignored while `submitting` so a save in flight can't be abandoned. */
  onClose: () => void;
  /**
   * When provided, the body is wrapped in a <form> and a submit button appears in the
   * sticky footer (Enter in a text field submits too). Omit it for read-only or
   * custom-footer content; the footer then shows a single Close button.
   */
  onSubmit?: () => unknown;
  submitLabel?: string;
  submitIcon?: ReactNode;
  submitting?: boolean;
  submitDisabled?: boolean;
  cancelLabel?: string;
  /** Shown just above the footer buttons so a failed save is never scrolled out of view. */
  error?: string | null;
  size?: ComponentProps<typeof PortalModal>["maxWidth"];
  children: ReactNode;
}

/**
 * The one modal every create/edit/assign form uses. It opens centred over the
 * current view (no scrolling back to the top of the page), keeps its title and
 * action buttons pinned while a long body scrolls, traps focus, closes on Escape,
 * and returns focus to the button that opened it. Clicking the backdrop or pressing
 * Escape closes it (unless a save is in flight).
 *
 * Built on PortalModal. Mount it conditionally, like the other dialogs in the app;
 * mounting means open. Put `data-autofocus` on the field that should get focus first.
 */
export function FormModal({
  title, description, onClose, onSubmit, submitLabel = "Save", submitIcon, submitting = false,
  submitDisabled = false, cancelLabel, error, size = "2xl", children,
}: FormModalProps) {
  const formId = useId();
  const hasForm = Boolean(onSubmit);
  const close = () => { if (!submitting) onClose(); };

  // Effects run child-first, so this lands after PortalModal's default focus on the close button.
  useEffect(() => {
    document.getElementById(formId)?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
  }, [formId]);

  const footer = (
    <>
      {error && (
        <p role="alert" className="w-full rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-left text-xs text-destructive">
          {error}
        </p>
      )}
      <FormCancelButton disabled={submitting} onClick={close}>
        {cancelLabel ?? (hasForm ? "Cancel" : "Close")}
      </FormCancelButton>
      {hasForm && (
        <FormSubmitButton form={formId} isSubmitting={submitting} disabled={submitting || submitDisabled}>
          {submitIcon}
          {submitLabel}
        </FormSubmitButton>
      )}
    </>
  );

  return (
    <PortalModal isOpen onClose={close} title={title} description={description} maxWidth={size} footer={footer}>
      {hasForm ? (
        <form id={formId} noValidate className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void Promise.resolve(onSubmit?.()).catch(() => undefined);
          }}>
          {children}
        </form>
      ) : (
        <div id={formId} className="space-y-5">{children}</div>
      )}
    </PortalModal>
  );
}
