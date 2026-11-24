import { useQueryClient } from "@tanstack/react-query";
import { addNetworkStateListener } from "expo-network";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { AppState } from "react-native";
import { saveRegister } from "@/api/teacher";
import { useToast } from "@/components/Toast";
import { SessionChangedError } from "@/lib/api-error";
import { flushRegisterQueue, pendingRegisterCount } from "@/lib/register-queue";
import { sessionStore, useSession } from "@/lib/session";

type RegisterSync = {
  pending: number;
  notice: string | null;
  sync: () => Promise<number | null>;
  refreshCount: () => Promise<void>;
};

const RegisterSyncContext = createContext<RegisterSync | null>(null);

export function RegisterSyncProvider({ children }: { children: ReactNode }) {
  const { subdomain } = useSession();
  const revision = sessionStore.getRevision();
  const queryClient = useQueryClient();
  const { show } = useToast();
  const [pending, setPending] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const current = useCallback(
    () => revision === sessionStore.getRevision(),
    [revision],
  );

  const refreshCount = useCallback(async () => {
    if (!subdomain || !current()) return;
    const count = await pendingRegisterCount(subdomain);
    if (current()) setPending(count);
  }, [subdomain, current]);

  const sync = useCallback(async () => {
    if (!subdomain || !current()) return null;
    try {
      const result = await flushRegisterQueue({
        subdomain,
        send: (entry) => {
          if (!current()) throw new SessionChangedError();
          return saveRegister({
            request: entry.batch,
            idempotencyKey: entry.key,
          });
        },
      });
      if (!current()) return null;
      setPending(result.remaining);
      if (result.rejected.length) {
        const dates = [...new Set(result.rejected.map(({ date }) => date))];
        const message = `SchoolHub could not accept attendance for ${dates.join(", ")}. Review those dates in the register.`;
        setNotice(message);
        show({ message, tone: "error" });
      }
      if (result.synced)
        void queryClient.invalidateQueries({
          queryKey: ["school", subdomain, "teacher"],
        });
      return result.remaining;
    } catch {
      if (current())
        setNotice(
          "SchoolHub could not read the offline register queue. Try syncing again.",
        );
      return null;
    }
  }, [current, queryClient, show, subdomain]);

  useEffect(() => {
    void Promise.resolve().then(sync);
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void sync();
    });
    const network = addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) void sync();
    });
    return () => {
      foreground.remove();
      network.remove();
    };
  }, [sync]);

  return (
    <RegisterSyncContext.Provider
      value={{ pending, notice, sync, refreshCount }}
    >
      {children}
    </RegisterSyncContext.Provider>
  );
}

export function useRegisterSync() {
  const context = useContext(RegisterSyncContext);
  if (!context) throw new Error("Teacher register sync is unavailable.");
  return context;
}
