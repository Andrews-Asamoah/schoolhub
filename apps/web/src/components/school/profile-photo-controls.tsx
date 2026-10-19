import { useMutation } from "@tanstack/react-query";
import { Camera, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/lib/auth-client";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

/**
 * Photo preview with Upload / Replace / Remove for the signed-in user. The API
 * stores the image in Cloudflare R2 and saves its public URL on the account.
 */
export function ProfilePhotoControls({ avatarClassName = "size-16 text-xl" }: { avatarClassName?: string }) {
  const { data: session, refetch } = useSession();
  const user = session?.user;
  const image = user?.image ?? null;
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

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

  return (
    <div className="flex items-center gap-4">
      <UserAvatar name={user?.name} image={image} className={avatarClassName} />
      <div className="min-w-0">
        <p className="text-[11px] text-slate-500">JPEG, PNG or WebP, up to 2 MB.</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
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
    </div>
  );
}
