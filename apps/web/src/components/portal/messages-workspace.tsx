import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Inbox, LoaderCircle, Mail, MailOpen, MessageSquare, Plus, Reply, Search, Send, UserRound, X } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { PortalModal } from "./portal-modal";
import { EmptyState, ErrorState } from "@/components/ui/empty-state";
import { useSchoolRole } from "@/components/school/school-role-switcher";
import { apiFetch } from "@/lib/api";

interface MessageContact {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  roles: string[];
}
interface MessageRecipientReceipt {
  id: string;
  recipientId: string;
  isRead: boolean;
  readAt: string | null;
  recipient?: { id: string; name: string; email: string } | null;
}
interface SchoolMessage {
  id: string;
  subject: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; email: string; image: string | null };
  recipients: MessageRecipientReceipt[];
}
type Folder = "inbox" | "sent";

const roleLabel = (role: string) => role.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const dateTime = (date: string) => new Intl.DateTimeFormat("en-GH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));

export function MessagesWorkspace() {
  const queryClient = useQueryClient();
  const { activeRole } = useSchoolRole();
  const [folder, setFolder] = useState<Folder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [selectedRecipients, setSelectedRecipients] = useState<string[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [messageNotice, setMessageNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const inboxQuery = useQuery({
    queryKey: ["messages", "inbox"],
    queryFn: () => apiFetch<SchoolMessage[]>("/messages/inbox"),
    enabled: folder === "inbox",
    retry: false,
  });
  const sentQuery = useQuery({
    queryKey: ["messages", "sent"],
    queryFn: () => apiFetch<SchoolMessage[]>("/messages/sent"),
    enabled: folder === "sent",
    retry: false,
  });
  const contactsQuery = useQuery({
    queryKey: ["messages", "recipients", recipientSearch],
    queryFn: () => apiFetch<MessageContact[]>(`/messages/recipients?search=${encodeURIComponent(recipientSearch)}`),
    enabled: composeOpen,
    retry: false,
  });

  const sendMutation = useMutation({
    mutationFn: (payload: { recipientIds: string[]; subject: string; body: string }) => apiFetch<SchoolMessage>("/messages", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async (message) => {
      setComposeOpen(false);
      setSubject("");
      setBody("");
      setSelectedRecipients([]);
      setRecipientSearch("");
      setSendError(null);
      setMessageNotice({ ok: true, text: "Message sent." });
      setFolder("sent");
      setSelectedId(message.id);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["messages"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
    onError: (error: Error) => setSendError(error.message),
  });

  const readMutation = useMutation({
    mutationFn: (id: string) => apiFetch<{ success: boolean }>(`/messages/${id}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["messages", "inbox"] }),
  });

  const items = folder === "inbox" ? inboxQuery.data ?? [] : sentQuery.data ?? [];
  const query = folder === "inbox" ? inboxQuery : sentQuery;
  const selected = items.find((item) => item.id === selectedId) ?? items[0] ?? null;
  const contacts = contactsQuery.data ?? [];
  const unreadCount = (inboxQuery.data ?? []).filter((item) => item.recipients.some((receipt) => !receipt.isRead)).length;
  const selectedContactNames = useMemo(() => selected?.recipients.map((receipt) => receipt.recipient?.name).filter((name): name is string => Boolean(name)).join(", ") ?? "", [selected]);

  function changeFolder(next: Folder) {
    setFolder(next);
    setSelectedId(null);
    setMessageNotice(null);
  }

  function openMessage(message: SchoolMessage) {
    setSelectedId(message.id);
    if (folder === "inbox" && message.recipients.some((receipt) => !receipt.isRead)) {
      readMutation.mutate(message.id);
    }
  }

  function composeReply(message: SchoolMessage) {
    const replyId = folder === "inbox" ? message.sender.id : message.recipients[0]?.recipientId;
    setSelectedRecipients(replyId ? [replyId] : []);
    setSubject(message.subject.startsWith("Re: ") ? message.subject : `Re: ${message.subject}`);
    setBody("");
    setSendError(null);
    setComposeOpen(true);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSendError(null);
    if (selectedRecipients.length === 0) {
      setSendError("Choose at least one recipient.");
      return;
    }
    sendMutation.mutate({ recipientIds: selectedRecipients, subject: subject.trim(), body: body.trim() });
  }

  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div className="flex items-start gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><MessageSquare className="size-5" /></span><div><h2 className="text-sm font-semibold text-foreground">School messages</h2><p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">Send private messages to permitted members of your school. Recipient access is restricted to your active school and role.</p></div></div>
        <button type="button" onClick={() => { setSendError(null); setComposeOpen(true); }} className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Plus className="size-4" />New message</button>
      </section>

      {messageNotice && <p role="status" className="rounded-lg border border-success/20 bg-success/10 px-3 py-2 text-xs text-success">{messageNotice.text}</p>}
      {query.isError && <ErrorState message={query.error.message} onRetry={() => void query.refetch()} />}

      <section className="grid min-h-[460px] overflow-hidden rounded-2xl border border-border bg-card shadow-sm lg:grid-cols-[minmax(260px,0.85fr)_minmax(0,1.5fr)]">
        <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r">
          <div className="flex items-center gap-1 border-b border-border p-2">
            <button type="button" onClick={() => changeFolder("inbox")} aria-pressed={folder === "inbox"} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold ${folder === "inbox" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><Inbox className="size-4" />Inbox{unreadCount > 0 && <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${folder === "inbox" ? "bg-primary-foreground/15" : "bg-muted"}`}>{unreadCount}</span>}</button>
            <button type="button" onClick={() => changeFolder("sent")} aria-pressed={folder === "sent"} className={`inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-xs font-semibold ${folder === "sent" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}><Send className="size-4" />Sent</button>
          </div>
          <div className="max-h-[620px] overflow-y-auto">
            {query.isPending ? <div className="flex items-center justify-center gap-2 p-10 text-xs text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />Loading messages…</div>
            : items.length === 0 ? <EmptyState icon={Mail} title={folder === "inbox" ? "Your inbox is empty" : "No sent messages"} description={folder === "inbox" ? "Messages sent to you by school members will appear here." : "Messages you send will be listed here."} compact className="m-3" />
            : items.map((item) => <button key={item.id} type="button" onClick={() => openMessage(item)} className={`block w-full border-b border-border px-4 py-3.5 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected?.id === item.id ? "bg-primary/5" : ""}`}><div className="flex items-start justify-between gap-2"><p className={`line-clamp-1 text-xs ${folder === "inbox" && item.recipients.some((receipt) => !receipt.isRead) ? "font-bold text-foreground" : "font-medium text-foreground"}`}>{folder === "inbox" ? item.sender.name : selectedContactNames && selected?.id === item.id ? selectedContactNames : item.recipients.map((receipt) => receipt.recipient?.name).filter(Boolean).join(", ") || "Recipients"}</p><time className="shrink-0 text-[10px] text-muted-foreground">{new Intl.DateTimeFormat("en-GH", { dateStyle: "short" }).format(new Date(item.createdAt))}</time></div><p className="mt-1 truncate text-sm font-semibold text-foreground">{item.subject}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{item.body}</p></button>)}
          </div>
        </div>

        <div className="min-w-0 p-4 sm:p-6">
          {!selected ? <EmptyState icon={MailOpen} title="Select a message" description="Choose a message from your inbox or sent folder to read it." className="h-full" />
          : <article className="space-y-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{folder === "inbox" ? "From" : "Sent by you"}</p><h2 className="mt-1 text-lg font-bold text-foreground">{selected.subject}</h2></div>{folder === "inbox" && <button type="button" onClick={() => composeReply(selected)} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold text-foreground hover:bg-muted"><Reply className="size-4" />Reply</button>}</div><div className="flex flex-wrap items-center gap-2 border-b border-border pb-4 text-xs text-muted-foreground"><span className="flex size-8 items-center justify-center rounded-full bg-muted text-foreground"><UserRound className="size-4" /></span><div className="min-w-0"><p className="font-semibold text-foreground">{folder === "inbox" ? selected.sender.name : "You"}</p><p>{folder === "inbox" ? selected.sender.email : `To: ${selected.recipients.map((receipt) => receipt.recipient?.name ?? receipt.recipientId).join(", ")}`}</p></div><time className="ml-auto">{dateTime(selected.createdAt)}</time></div><div className="whitespace-pre-wrap break-words text-sm leading-7 text-foreground">{selected.body}</div><div className="border-t border-border pt-3 text-[11px] text-muted-foreground">{folder === "inbox" ? (selected.recipients.some((receipt) => receipt.isRead) ? "Read" : "Unread") : `Sent to ${selected.recipients.length} recipient${selected.recipients.length === 1 ? "" : "s"}`}</div></article>}
        </div>
      </section>

      <PortalModal isOpen={composeOpen} onClose={() => setComposeOpen(false)} title="New message" description="Messages are private to the sender and selected recipients within this school." maxWidth="2xl" footer={<><button type="button" onClick={() => setComposeOpen(false)} className="h-10 rounded-lg border border-border px-4 text-xs font-semibold text-foreground hover:bg-muted">Cancel</button><button type="submit" form="school-message-compose" disabled={sendMutation.isPending} className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{sendMutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}{sendMutation.isPending ? "Sending…" : "Send message"}</button></>} >
        <form id="school-message-compose" onSubmit={submit} className="space-y-4">
          {sendError && <p role="alert" className="rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive">{sendError}</p>}
          <div className="space-y-2"><div className="flex items-center justify-between gap-3"><label htmlFor="message-recipient-search" className="text-xs font-semibold text-foreground">Recipients <span className="font-normal text-muted-foreground">({selectedRecipients.length}/25)</span></label><span className="text-[10px] text-muted-foreground">Role-limited list</span></div><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input id="message-recipient-search" value={recipientSearch} onChange={(event) => setRecipientSearch(event.target.value)} placeholder="Search school members…" className="h-10 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /></div><div className="max-h-48 overflow-y-auto rounded-lg border border-border">
          {contactsQuery.isPending ? <div className="p-4 text-xs text-muted-foreground">Loading school members…</div>
          : contactsQuery.isError ? <div role="alert" className="p-4 text-xs text-destructive">{contactsQuery.error.message}</div>
          : contacts.length === 0 ? <div className="p-4 text-xs text-muted-foreground">No permitted recipients match this search.</div>
          : contacts.map((contact) => <label key={contact.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-2.5 last:border-b-0 hover:bg-muted/50"><input type="checkbox" checked={selectedRecipients.includes(contact.id)} disabled={!selectedRecipients.includes(contact.id) && selectedRecipients.length >= 25} onChange={(event) => setSelectedRecipients((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} className="size-4 accent-primary" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-foreground">{contact.name}</span><span className="block truncate text-[10px] text-muted-foreground">{contact.email} · {roleLabel(contact.role)}</span></span></label>)}
          </div></div>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Subject<input value={subject} onChange={(event) => setSubject(event.target.value)} required minLength={2} maxLength={160} placeholder="What is this message about?" className="h-10 rounded-lg border border-input bg-background px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring" /></label>
          <label className="grid gap-1.5 text-xs font-semibold text-foreground">Message<textarea value={body} onChange={(event) => setBody(event.target.value)} required maxLength={10000} rows={6} placeholder="Write your message…" className="min-h-32 resize-y rounded-lg border border-input bg-background px-3 py-2.5 text-sm font-normal leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring" /><span className="text-right text-[10px] font-normal text-muted-foreground">{body.length.toLocaleString()} / 10,000</span></label>
        </form>
      </PortalModal>
    </div>
  );
}
