import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import {
  commands as localSttCommands,
  type SupportedSttModel,
} from "@openmushi/plugin-local-stt";
import type { AIProviderStorage } from "@openmushi/store";

import { providerRowId } from "~/settings/ai/shared";
import { type ProviderId } from "~/settings/ai/stt/shared";
import * as settings from "~/store/tinybase/store/settings";

export const useSTTConnection = () => {
  const { current_stt_provider, current_stt_model } = settings.UI.useValues(
    settings.STORE_ID,
  ) as {
    current_stt_provider: ProviderId | undefined;
    current_stt_model: string | undefined;
  };

  const providerConfig = settings.UI.useRow(
    "ai_providers",
    current_stt_provider ? providerRowId("stt", current_stt_provider) : "",
    settings.STORE_ID,
  ) as AIProviderStorage | undefined;

  const isLocalModel = current_stt_provider === "sherpa";

  const isCloudModel = false;

  const local = useQuery({
    enabled: current_stt_provider === "sherpa",
    queryKey: ["stt-connection", isLocalModel, current_stt_model],
    refetchInterval: 1000,
    queryFn: async () => {
      if (!isLocalModel || !current_stt_model) {
        return null;
      }

      const downloaded = await localSttCommands.isModelDownloaded(
        current_stt_model as SupportedSttModel,
      );
      if (downloaded.status !== "ok" || !downloaded.data) {
        return { status: "not_downloaded" as const, connection: null };
      }

      const serverResult = await localSttCommands.getServerForModel(
        current_stt_model as SupportedSttModel,
      );

      if (serverResult.status !== "ok") {
        return null;
      }

      const server = serverResult.data;

      if (server?.status === "ready" && server.url) {
        return {
          status: "ready" as const,
          connection: {
            provider: current_stt_provider!,
            model: current_stt_model,
            baseUrl: server.url,
            apiKey: "",
          },
        };
      }

      return {
        status: server?.status ?? "loading",
        connection: null,
      };
    },
  });

  const baseUrl = providerConfig?.base_url?.trim();
  const apiKey = providerConfig?.api_key?.trim();

  const connection = useMemo(() => {
    if (!current_stt_provider || !current_stt_model) {
      return null;
    }

    if (isLocalModel) {
      return local.data?.connection ?? null;
    }

    if (isCloudModel) {
      // Cloud STT requires authentication; not available in local-only mode
      return null;
    }

    if (!baseUrl || !apiKey) {
      return null;
    }

    return {
      provider: current_stt_provider,
      model: current_stt_model,
      baseUrl,
      apiKey,
    };
  }, [
    current_stt_provider,
    current_stt_model,
    isLocalModel,
    isCloudModel,
    local.data,
    baseUrl,
    apiKey,
  ]);

  return {
    conn: connection,
    local,
    isLocalModel,
    isCloudModel,
  };
};
