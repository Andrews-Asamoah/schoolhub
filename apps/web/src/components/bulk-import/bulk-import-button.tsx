import { Upload } from "lucide-react";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/button";

/** The single trigger for every bulk upload, so they look and read the same everywhere. */
export function BulkImportButton({
  label = "Bulk upload",
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "children" | "variant" | "size"> & { label?: string }) {
  return (
    <Button type="button" variant="outline" className={className ?? "text-xs"} {...props}>
      <Upload aria-hidden="true" className="size-4" />
      {label}
    </Button>
  );
}
