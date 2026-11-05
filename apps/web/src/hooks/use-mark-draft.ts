import { useEffect, useRef, useState, type SetStateAction } from "react";
import { useBlocker } from "@tanstack/react-router";
import { useSession } from "@/lib/auth-client";

const dirtyEditors = new Set<symbol>();
export function confirmLeavingDrafts() {
  return dirtyEditors.size === 0 || window.confirm("You have unsaved marks. Continue? Your draft will remain available in this tab for 24 hours.");
}

/** Tab-local recovery, scoped to principal, school, role, term and sheet. */
export function useMarkDraft<T>(sheetKey: string, valid: (value: unknown) => value is T) {
  const { data: session } = useSession();
  const key = "schoolhub-draft:" + JSON.stringify([session?.user.id, session?.session.activeOrganizationId,
    window.localStorage.getItem("schoolhub-active-role"), sheetKey]);
  const load = (): Record<string, T> => {
    try {
      const raw = JSON.parse(sessionStorage.getItem(key) ?? "null") as { at?: number; value?: Record<string, unknown> } | null;
      if (!raw || typeof raw.at !== "number" || Date.now() - raw.at > 86400000 || !raw.value ||
        !Object.values(raw.value).every(valid)) return {};
      return raw.value as Record<string, T>;
    } catch { return {}; }
  };
  const [state, setState] = useState(() => ({ key, value: load() }));
  const value = state.key === key ? state.value : load();
  function setValue(action: SetStateAction<Record<string, T>>) {
    setState(previous => {
      const current = previous.key === key ? previous.value : load();
      return { key, value: typeof action === "function" ? action(current) : action };
    });
  }
  useEffect(() => {
    if (state.key !== key) { setState({ key, value: load() }); return; }
    try {
      if (Object.keys(state.value).length) sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value: state.value }));
      else sessionStorage.removeItem(key);
    } catch { /* A storage quota failure must not prevent in-memory mark entry. */ }
  }, [key, state]);
  const dirty = Object.keys(value).length > 0;
  const token = useRef(Symbol("mark-editor"));
  useEffect(() => {
    const id = token.current;
    if (dirty) dirtyEditors.add(id); else dirtyEditors.delete(id);
    return () => { dirtyEditors.delete(id); };
  }, [dirty]);
  useBlocker({ disabled: !dirty, enableBeforeUnload: dirty, shouldBlockFn: () => !confirmLeavingDrafts() });
  return [value, setValue] as const;
}
