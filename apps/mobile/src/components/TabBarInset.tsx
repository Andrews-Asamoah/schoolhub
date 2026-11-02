import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
const Context = createContext({ inset: 0, setInset: (_value: number) => {} });
/** Measured clearance, shared by a tab navigator and all of its screens. */
export function TabBarInsetProvider({ children }: { children: ReactNode }) {
  const [inset, setInset] = useState(0);
  const value = useMemo(() => ({ inset, setInset }), [inset]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useTabBarInset() {
  return useContext(Context).inset;
}
export function useSetTabBarInset() {
  return useContext(Context).setInset;
}
