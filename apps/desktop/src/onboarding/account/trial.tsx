// Cloud trial/billing flow removed. This hook is stubbed.
// In the local-only build, all users are treated as "pro".

import { useEffect, useRef } from "react";

export type TrialPhase =
  | "checking"
  | "starting"
  | "already-pro"
  | "already-trialing"
  | { done: "started" | "not_eligible" | "error" };

export function useTrialFlow(onContinue: () => void) {
  const hasTriggeredRef = useRef(false);

  useEffect(() => {
    if (hasTriggeredRef.current) return;
    hasTriggeredRef.current = true;

    // Local-only: skip trial, treat as pro, continue immediately
    setTimeout(onContinue, 500);
  }, [onContinue]);

  return "already-pro" as const;
}
