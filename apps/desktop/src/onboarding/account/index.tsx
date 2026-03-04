import { useEffect } from "react";

export function LoginSection({ onContinue }: { onContinue: () => void }) {
  // No auth needed in local-only mode — auto-continue
  useEffect(() => {
    onContinue();
  }, [onContinue]);

  return null;
}
