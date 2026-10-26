import type { ReactNode } from "react";
import { PageHeader as SharedPageHeader } from "@/components/ui/page-header";

interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}

/** Retained public API; rendered consistently with school headings. */
export function PageHeader({ eyebrow, title, description, actions }: PageHeaderProps) {
  return <SharedPageHeader eyebrow={eyebrow} title={title} description={description} actions={actions} />;
}
