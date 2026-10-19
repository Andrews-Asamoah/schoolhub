import { useMutation } from "@tanstack/react-query";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Header account button. Opens a small panel where any signed-in user can
 * upload, replace or remove their own profile photo. The API stores the image
 * in Cloudflare R2 and saves its public URL on the user's account.
 */
export function ProfilePhotoMenu({ subtitle }: { subtitle: string }) {
  const { data: session, refetch } = useSession();
  const user = session?.user;
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("avatar", file);
      return apiFetch("/schools/current/me/avatar", { method: "PUT", body });
    },
    onSuccess: async () => {
      setMessage({ ok: true, text: "Photo updated." });
      await refetch();
    },
    onError: (error: Error) => setMessage({ ok: false, text: error.message }),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch("/schools/current/me/avatar", { method: "DELETE" }),
    onSuccess: async () => {
      setMessage({ ok: true, text: "Photo removed." });
      await refetch();
    },
    onError: (error: Error) => setMessage({ ok: false, text: error.message }),
  });

  function onPick(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    if (!ACCEPTED.includes(file.type)) {
      setMessage({ ok: false, text: "Choose a JPEG, PNG or WebP image." });
      return;
    }
    if (file.size > MAX_BYTES) {
      setMessage({ ok: false, text: "The image must be 2 MB or smaller." });
      return;
    }
    upload.mutate(file);
  }

  const busy = upload.isPending || remove.isPending;
  const image = user?.image ?? null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-right transition hover:bg-slate-100 dark:hover:bg-white/10"
      >
        <span className="hidden sm:block">
          <span className="block text-xs font-semibold text-slate-800">{user?.name ?? "School admin"}</span>
          <span className="block text-[10px] text-slate-500">{subtitle}</span>
        </span>
        <UserAvatar name={user?.name} image={image} className="size-9" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Profile photo"
          className="absolute right-0 z-30 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-lg dark:border-white/10 dark:bg-slate-900"
        >
          <div className="flex items-center gap-3">
            <UserAvatar name={user?.name} image={image} className="size-16 text-xl" />
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">{user?.name}</p>
              <p className="truncate text-[11px] text-slate-500">{user?.email}</p>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-slate-500">JPEG, PNG or WebP, up to 2 MB.</p>
          <div className="mt-2 flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPTED.join(",")}
              className="sr-only"
              aria-label="Choose a profile photo"
              onChange={(event) => {
                onPick(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {upload.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
              {image ? "Replace photo" : "Upload photo"}
            </button>
            {image && (
              <button
                type="button"
                disabled={busy}
                onClick={() => remove.mutate()}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60 dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/5"
              >
                {remove.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Remove
              </button>
            )}
          </div>
          {message && (
            <p role={message.ok ? "status" : "alert"} className={`mt-2 text-[11px] ${message.ok ? "text-emerald-700" : "text-red-600"}`}>
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
