import {
  Accordion,
} from "@openmushi/ui/components/ui/accordion";

import { useLlmSettings } from "./context";
import { PROVIDERS } from "./shared";

import {
  NonHyprProviderCard,
  StyledStreamdown,
} from "~/settings/ai/shared";

export function ConfigureProviders() {
  const { accordionValue, setAccordionValue } = useLlmSettings();

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-md font-serif font-semibold">Configure Providers</h3>
      <Accordion
        type="single"
        collapsible
        className="flex flex-col gap-3"
        value={accordionValue}
        onValueChange={setAccordionValue}
      >
        {PROVIDERS.map((provider) => (
            <NonHyprProviderCard
              key={provider.id}
              config={provider}
              providerType="llm"
              providers={PROVIDERS}
              providerContext={<ProviderContext providerId={provider.id} />}
            />
          ))}
      </Accordion>
    </div>
  );
}

function ProviderContext({ providerId }: { providerId: string }) {
  const content =
    providerId === "lmstudio"
        ? "- Ensure LM Studio server is **running.** (Default port is 1234)\n- Enable **CORS** in LM Studio config."
        : providerId === "ollama"
          ? "- Ensure Ollama is **running** (`ollama serve`)\n- Pull a model first (`ollama pull llama3.2`)"
          : providerId === "custom"
            ? "We only support **OpenAI-compatible** endpoints for now."
            : providerId === "openrouter"
              ? "We filter out models from the combobox based on heuristics like **input modalities** and **tool support**."
              : providerId === "azure_openai"
                ? "Enter your **Azure OpenAI endpoint** (e.g. `https://your-resource.openai.azure.com`) as the Base URL and your **API key**."
                : providerId === "azure_ai"
                  ? "Enter your **Azure AI Foundry endpoint** as the Base URL and your **API key**. Supports Claude and other models deployed via Azure AI Foundry."
                  : providerId === "google_generative_ai"
                    ? "Visit [AI Studio](https://aistudio.google.com/api-keys) to create an API key."
                    : "";

  if (!content) {
    return null;
  }

  return <StyledStreamdown className="mb-3">{content}</StyledStreamdown>;
}
