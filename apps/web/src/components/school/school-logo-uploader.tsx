import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ImageUp, LoaderCircle, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useSchoolRole } from "@/components/school/school-role-switcher";

const MAX_BYTES = 2 * 1024 * 1024;

/** Upload / replace / remove the school logo (stored in Cloudflare R2 by the API). */
export function SchoolLogoUploader({ logo }: { logo?: string | null }) {
  const { activeRole } = useSchoolRole();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["school"] }),
      queryClient.invalidateQueries({ queryKey: ["tenant"] }),
    ]);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const body = new FormData();
      body.append("logo", file);
      return apiFetch("/schools/current/logo", { method: "PUT", body });
    },
    onSuccess: async () => {
      setMessage({ ok: true, text: "Logo updated." });
      await refresh();
    },
    onError: (error: Error) => setMessage({ ok: false, text: error.message }),
  });

  const remove = useMutation({
    mutationFn: () => apiFetch("/schools/current/logo", { method: "DELETE" }),
    onSuccess: async () => {
      setMessage({ ok: true, text: "Logo removed." });
      await refresh();
    },
    onError: (error: Error) => setMessage({ ok: false, text: error.message }),
  });

  if (activeRole !== "owner" && activeRole !== "admin") return null;

  function onPick(file: File | undefined) {
    setMessage(null);
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
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
    <div className="mb-5 flex flex-wrap items-center gap-4 border-b border-slate-100 pb-5">
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {logo ? (
          <img src={logo} alt="School logo" className="size-full object-contain" />
        ) : (
          <ImageUp className="size-6 text-slate-300" />
        )}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-800">School logo</p>
        <p className="mt-0.5 text-[11px] text-slate-500">JPEG, PNG or WebP, up to 2 MB.</p>
        <div className="mt-2 flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
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
            {upload.isPending ? <LoaderCircle className="size-3.5 animate-spin" /> : <ImageUp className="size-3.5" />}
            {logo ? "Replace" : "Upload"}
          </button>
          {logo && (
            <button
              type="button"
              disabled={busy}
              onClick={() => remove.mutate()}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-60"
            >
              <Trash2 className="size-3.5" /> Remove
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
