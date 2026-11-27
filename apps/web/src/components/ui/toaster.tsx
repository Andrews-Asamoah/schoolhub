import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { useSyncExternalStore } from "react";

type ToastKind = "success" | "error";
interface ToastItem { id: number; kind: ToastKind; message: string }

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(next: ToastItem[]) {
  items = next;
  listeners.forEach((listener) => listener());
}

function dismiss(id: number) {
  emit(items.filter((item) => item.id !== id));
}

function push(kind: ToastKind, message: string) {
  // Collapse an identical toast already on screen (e.g. several failed requests at once).
  if (items.some((item) => item.kind === kind && item.message === message)) return;
  const id = nextId++;
  emit([...items.slice(-3), { id, kind, message }]);
  window.setTimeout(() => dismiss(id), kind === "error" ? 8000 : 4000);
}

export const toast = {
  success: (message: string) => push("success", message),
  error: (message: string) => push("error", message),
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};

export function Toaster() {
  const current = useSyncExternalStore(subscribe, () => items, () => items);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[110] flex flex-col items-center gap-2 px-4" aria-live="polite">
      {current.map((item) => (
        <div
          key={item.id}
          role={item.kind === "error" ? "alert" : "status"}
          className="pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-xl border border-border bg-card p-3 text-sm text-card-foreground shadow-lg"
        >
          {item.kind === "error"
            ? <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
            : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />}
          <p className="min-w-0 flex-1 break-words">{item.message}</p>
          <button type="button" onClick={() => dismiss(item.id)} aria-label="Dismiss" className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
