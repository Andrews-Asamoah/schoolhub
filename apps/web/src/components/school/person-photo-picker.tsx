import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export async function uploadPersonPhoto(kind: "teacher" | "student", id: string, file: File) {
  const body = new FormData();
  body.append("avatar", file);
  return apiFetch(`/schools/current/photos/${kind}/${id}`, { method: "PUT", body });
}

export function PersonPhotoPicker({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const [preview, setPreview] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file) { setPreview(undefined); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return <div className="mb-4 space-y-2">
    <label className="block text-sm font-medium">Profile image (optional)
      <input type="file" accept="image/jpeg,image/png,image/webp" className="mt-2 block w-full text-sm" onChange={(event) => {
        const selected = event.target.files?.[0];
        event.target.value = "";
        if (!selected) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(selected.type) || selected.size > 2 * 1024 * 1024) {
          setError("Choose a JPEG, PNG or WebP image up to 2 MB."); return;
        }
        setError(""); onChange(selected);
      }} />
    </label>
    <p className="text-xs text-muted-foreground">JPEG, PNG or WebP, up to 2 MB. Saved when you submit this form. Leave blank to keep the existing photo.</p>
    {preview && <div className="flex items-center gap-3"><img src={preview} alt="Selected profile photo" className="size-20 rounded-lg object-cover" /><button type="button" className="text-sm text-muted-foreground" onClick={() => onChange(null)}>Clear selection</button></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>;
}
