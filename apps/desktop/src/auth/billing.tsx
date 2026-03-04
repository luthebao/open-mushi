import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
} from "react";

export type BillingAccess = BillingContextValue;

type BillingContextValue = {
  isReady: boolean;
  isPro: boolean;
  isTrial: boolean;
  trialEnd: string | null;
  canStartTrial: { data: boolean; isPending: boolean };
  upgradeToPro: () => void;
};

const BillingContext = createContext<BillingContextValue | null>(null);

export function BillingProvider({ children }: { children: ReactNode }) {
  const value = useMemo<BillingContextValue>(
    () => ({
      isReady: true,
      isPro: true,
      isTrial: false,
      trialEnd: null,
      canStartTrial: { data: false, isPending: false },
      upgradeToPro: () => {},
    }),
    [],
  );

  return (
    <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
  );
}

export function useBillingAccess() {
  const context = useContext(BillingContext);

  if (!context) {
    throw new Error("useBillingAccess must be used within BillingProvider");
  }

  return context;
}
