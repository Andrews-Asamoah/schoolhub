import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GuardianWard } from "@/api/guardian";
import { useMyWardsQuery } from "./queries";

type GuardianContextValue = {
  wards: GuardianWard[];
  activeWard: GuardianWard | null;
  selectWard: (id: string) => void;
  isPending: boolean;
  isError: boolean;
  refetch: () => void;
};
const GuardianContext = createContext<GuardianContextValue | null>(null);

export function GuardianProvider({ children }: { children: ReactNode }) {
  const query = useMyWardsQuery();
  const { data, isPending, isError, refetch } = query;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const wards = useMemo(() => data ?? [], [data]);
  const activeWard =
    wards.find((ward) => ward.id === selectedId) ?? wards[0] ?? null;
  const value = useMemo<GuardianContextValue>(
    () => ({
      wards,
      activeWard,
      selectWard: setSelectedId,
      isPending,
      isError,
      refetch: () => {
        void refetch();
      },
    }),
    [activeWard, isError, isPending, refetch, wards],
  );
  return (
    <GuardianContext.Provider value={value}>
      {children}
    </GuardianContext.Provider>
  );
}

export function useGuardian() {
  const value = useContext(GuardianContext);
  if (!value)
    throw new Error("useGuardian must be used within GuardianProvider.");
  return value;
}
