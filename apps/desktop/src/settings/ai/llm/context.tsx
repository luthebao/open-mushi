import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import { useConfigValues } from "~/shared/config";
import { useToastAction } from "~/store/zustand/toast-action";

type LlmSettingsContextType = {
  accordionValue: string;
  setAccordionValue: (value: string) => void;
  openProviderAccordion: () => void;
  startTrial: () => void;
  shouldHighlight: boolean;
  hyprAccordionRef: React.RefObject<HTMLDivElement | null>;
};

const LlmSettingsContext = createContext<LlmSettingsContextType | null>(null);

export function LlmSettingsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { current_llm_provider, current_llm_model } = useConfigValues([
    "current_llm_provider",
    "current_llm_model",
  ] as const);
  const hasLlmConfigured = !!(current_llm_provider && current_llm_model);

  const [accordionValue, setAccordionValue] = useState<string>(
    hasLlmConfigured ? "" : "openmushi",
  );
  const [shouldHighlight, setShouldHighlight] = useState(false);
  const hyprAccordionRef = useRef<HTMLDivElement | null>(null);

  const toastActionTarget = useToastAction((state) => state.target);
  const clearToastActionTarget = useToastAction((state) => state.clearTarget);

  useEffect(() => {
    if (toastActionTarget === "llm") {
      setAccordionValue("openmushi");
      setShouldHighlight(true);

      const timer = setTimeout(() => {
        hyprAccordionRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }, 100);

      clearToastActionTarget();
      return () => clearTimeout(timer);
    }
  }, [toastActionTarget, clearToastActionTarget]);

  useEffect(() => {
    if (hasLlmConfigured && shouldHighlight) {
      setShouldHighlight(false);
    }
  }, [hasLlmConfigured, shouldHighlight]);

  const openProviderAccordion = useCallback(() => {
    setAccordionValue("openmushi");
  }, []);

  const startTrial = useCallback(() => {
    openProviderAccordion();
  }, [openProviderAccordion]);

  return (
    <LlmSettingsContext.Provider
      value={{
        accordionValue,
        setAccordionValue,
        openProviderAccordion,
        startTrial,
        shouldHighlight,
        hyprAccordionRef,
      }}
    >
      {children}
    </LlmSettingsContext.Provider>
  );
}

export function useLlmSettings() {
  const context = useContext(LlmSettingsContext);
  if (!context) {
    throw new Error("useLlmSettings must be used within LlmSettingsProvider");
  }
  return context;
}
