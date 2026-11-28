import { invoke } from "@tauri-apps/api/core";
import { useQuery } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { confirmAction } from "@/components/ui/confirm-host";
import { toast } from "@/components/ui/toaster";

interface AvailableUpdate {
  version: string;
  notes?: string | null;
}

const SHOW_UPDATE_EVENT = "schoolhub:show-update";

function useDesktopUpdate(enabled: boolean) {
  return useQuery({
    queryKey: ["desktop-release-update"],
    queryFn: () => invoke<AvailableUpdate | null>("desktop_check_update"),
    enabled,
    staleTime: 30 * 60_000,
    refetchInterval: 60 * 60_000,
    retry: false,
  });
}

export default function DesktopUpdateNotice() {
  const { data: update, refetch } = useDesktopUpdate(true);
  const [dismissed, dismiss] = useState<string>();
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const show = () => dismiss(undefined);
    window.addEventListener(SHOW_UPDATE_EVENT, show);
    return () => window.removeEventListener(SHOW_UPDATE_EVENT, show);
  }, []);
  if (!update || update.version === dismissed) return null;

  async function install(available: AvailableUpdate) {
    setBusy(true);
    try {
      const confirmed = await confirmAction({
        title: `Install SchoolHub ${available.version}?`,
        description: [
          "Save your work first. SchoolHub will close while the update is installed.",
          available.notes?.slice(0, 650),
        ].filter(Boolean).join("\n\n"),
        confirmLabel: "Download and install",
      });
      if (!confirmed) return;
      await invoke("desktop_install_update", { version: available.version });
    } catch {
      toast.error("Could not install the update. Check for updates and try again.");
      void refetch();
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside aria-label="SchoolHub update" className="fixed right-4 top-4 z-40 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-border bg-card p-3 text-card-foreground shadow-lg">
      <Download className="size-4 shrink-0 text-primary" aria-hidden />
      <span role="status" className="text-sm font-medium">
        {busy ? "Updating SchoolHub…" : `SchoolHub ${update.version} is available`}
      </span>
      <Button size="sm" disabled={busy} onClick={() => void install(update)}>Update</Button>
      <Button size="icon" variant="ghost" disabled={busy} aria-label="Dismiss update" onClick={() => dismiss(update.version)}>
        <X className="size-4" />
      </Button>
    </aside>
  );
}

export function DesktopUpdateCheck() {
  const query = useDesktopUpdate(false);
  async function check() {
    const result = await query.refetch();
    if (result.isError) {
      toast.error("Could not check for updates. Try again when connected.");
    } else if (result.data) {
      window.dispatchEvent(new Event(SHOW_UPDATE_EVENT));
    } else {
      toast.success("No SchoolHub updates are available.");
    }
  }

  return <Button type="button" size="sm" variant="outline" disabled={query.isFetching} onClick={() => void check()}>
    {query.isFetching ? "Checking…" : "Check for updates"}
  </Button>;
}
