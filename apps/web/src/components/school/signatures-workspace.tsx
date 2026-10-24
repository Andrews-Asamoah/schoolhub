import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, ImagePlus, LoaderCircle, Trash2, UploadCloud, UserRoundPen } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

type Person = {
  id: string;
  teacherId?: string;
  staffNumber?: string | null;
  staffType?: string;
  firstName?: string | null;
  lastName?: string | null;
  profile?: {
    firstName?: string | null;
    lastName?: string | null;
    signatureUrl?: string | null;
    user?: { email?: string | null } | null;
  } | null;
};
type ListResponse = { data: Person[] };
type PersonKind = "teacher" | "staff";
const button = "inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50";
const personName = (person: Person) => [person.profile?.firstName ?? person.firstName, person.profile?.lastName ?? person.lastName].filter(Boolean).join(" ").trim() || person.teacherId || person.staffNumber || "Staff member";

export function SignaturesWorkspace() {
  const client = useQueryClient();
  const [kind, setKind] = useState<PersonKind>("teacher");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const teachersQuery = useQuery({
    queryKey: ["people", "teachers", "signatures"],
    queryFn: () => apiFetch<ListResponse>("/people/teachers?page=1&limit=100&active=true"),
    retry: false,
  });
  const staffQuery = useQuery({
    queryKey: ["people", "staff", "signatures"],
    queryFn: () => apiFetch<ListResponse>("/people/staff?page=1&limit=100&active=true"),
    retry: false,
  });
  const upload = useMutation({
    mutationFn: async ({ person, file }: { person: Person; file: File }) => {
      const form = new FormData();
      form.append("signature", file);
      return apiFetch<{ signatureUrl: string }>("/schools/current/signatures/" + kind + "/" + person.id, { method: "PUT", body: form });
    },
    onSuccess: async () => {
      setFeedback({ kind: "success", text: "Signature uploaded to Cloudflare R2 and linked to the staff profile." });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["people", "teachers"] }),
        client.invalidateQueries({ queryKey: ["people", "staff"] }),
        client.invalidateQueries({ queryKey: ["people", "teachers", "signatures"] }),
        client.invalidateQueries({ queryKey: ["people", "staff", "signatures"] }),
      ]);
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });
  const remove = useMutation({
    mutationFn: (person: Person) => apiFetch<{ signatureUrl: null }>("/schools/current/signatures/" + kind + "/" + person.id, { method: "DELETE" }),
    onSuccess: async () => {
      setFeedback({ kind: "success", text: "Signature removed from the staff profile." });
      await Promise.all([
        client.invalidateQueries({ queryKey: ["people", "teachers"] }),
        client.invalidateQueries({ queryKey: ["people", "staff"] }),
        client.invalidateQueries({ queryKey: ["people", "teachers", "signatures"] }),
        client.invalidateQueries({ queryKey: ["people", "staff", "signatures"] }),
      ]);
    },
    onError: (error: Error) => setFeedback({ kind: "error", text: error.message }),
  });

  const query = kind === "teacher" ? teachersQuery : staffQuery;
  const people = query.data?.data ?? [];

  return (
    <div className="mx-auto w-full min-w-0 max-w-screen-2xl space-y-6">
      <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">School administration</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">Staff signatures</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">Upload authorised signatures for teachers, accountants, the headteacher and other staff members. Images are validated on the server, stored in your school's Cloudflare R2 folder, and linked to each person's profile for reuse in supported forms and printouts.</p>
      </section>

      {feedback && <div role={feedback.kind === "error" ? "alert" : "status"} className={cn("rounded-xl border p-3 text-sm", feedback.kind === "error" ? "border-destructive/30 bg-destructive/5 text-destructive" : "border-border bg-muted/40 text-foreground")}>{feedback.text}</div>}

      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3"><div className="rounded-xl bg-primary/10 p-2 text-primary"><UserRoundPen className="size-5" /></div><div><h2 className="font-semibold">Choose a staff group</h2><p className="mt-1 text-sm text-muted-foreground">Only active school records are listed.</p></div></div>
          <div className="flex gap-2"><button type="button" className={cn("rounded-xl px-4 py-2 text-sm font-semibold", kind === "teacher" ? "bg-primary text-primary-foreground" : "border border-border bg-card")} onClick={() => { setKind("teacher"); setFeedback(null); }}>Teachers</button><button type="button" className={cn("rounded-xl px-4 py-2 text-sm font-semibold", kind === "staff" ? "bg-primary text-primary-foreground" : "border border-border bg-card")} onClick={() => { setKind("staff"); setFeedback(null); }}>Staff & administration</button></div>
        </div>
      </section>

      {query.isPending ? <div className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-card p-12 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" /> Loading staff records…</div>
      : query.error ? <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{query.error.message}</div>
      : people.length === 0 ? <div className="rounded-2xl border border-dashed border-border p-10 text-center"><UserRoundPen className="mx-auto size-8 text-muted-foreground" /><h3 className="mt-3 font-semibold">No active records found</h3><p className="mt-1 text-sm text-muted-foreground">Add the person under People first, then return here to upload their signature.</p></div>
      : <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{people.map((person) => {
        const signatureUrl = person.profile?.signatureUrl;
        const inputId = "signature-" + kind + "-" + person.id;
        return <article key={person.id} className="flex min-w-0 flex-col rounded-2xl border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start gap-3"><div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserRoundPen className="size-5" /></div><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{personName(person)}</h3><p className="truncate text-xs text-muted-foreground">{person.profile?.user?.email || person.staffType || person.staffNumber || person.teacherId || (kind === "teacher" ? "Teacher" : "Staff member")}</p></div>{signatureUrl && <CheckCircle2 className="size-5 shrink-0 text-emerald-600" aria-label="Signature uploaded" />}</div>
          <div className="mt-4 flex h-32 items-center justify-center overflow-hidden rounded-xl border border-dashed border-border bg-muted/30 p-3">{signatureUrl ? <img src={signatureUrl} alt={"Signature of " + personName(person)} className="max-h-full max-w-full object-contain" /> : <div className="text-center text-muted-foreground"><ImagePlus className="mx-auto size-6" /><p className="mt-2 text-xs">No signature uploaded</p></div>}</div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label htmlFor={inputId} className={cn(button, "cursor-pointer")}>{upload.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <UploadCloud className="size-4" />}{signatureUrl ? "Replace signature" : "Upload signature"}</label>
            <input id={inputId} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={upload.isPending} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; if (!file) return; if (file.size > 2 * 1024 * 1024) { setFeedback({ kind: "error", text: "Choose an image no larger than 2 MB." }); return; } setFeedback(null); upload.mutate({ person, file }); }} />
            {signatureUrl && <button type="button" className={button} disabled={remove.isPending} onClick={() => { if (window.confirm("Remove the stored signature for " + personName(person) + "?")) remove.mutate(person); }}><Trash2 className="size-4" /> Remove</button>}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">PNG, JPEG or WebP · maximum 2 MB</p>
        </article>;
      })}</div>}
      <p className="text-xs leading-5 text-muted-foreground">Signatures are stored under this school's isolated Cloudflare R2 prefix. Uploading a signature makes it available on the person's profile; individual forms and printouts must explicitly render that profile signature when they support it.</p>
    </div>
  );
}
