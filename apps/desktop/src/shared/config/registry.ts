import { disable, enable } from "@tauri-apps/plugin-autostart";

import { commands as analyticsCommands } from "@openmushi/plugin-analytics";
import { commands as detectCommands } from "@openmushi/plugin-detect";
import {
  commands as localSttCommands,
  type SpeakerModel,
  type SupportedSttModel,
} from "@openmushi/plugin-local-stt";

export type ConfigKey =
  | "autostart"
  | "notification_detect"
  | "notification_event"
  | "respect_dnd"
  | "ignored_platforms"
  | "mic_active_threshold"
  | "current_stt_provider"
  | "current_stt_model"
  | "ai_language"
  | "spoken_languages"
  | "save_recordings"
  | "telemetry_consent"
  | "current_llm_provider"
  | "current_llm_model"
  | "timezone"
  | "week_start"
  | "speaker_diarization_enabled"
  | "speaker_diarization_model"
  | "speaker_similarity_threshold";

type ConfigValueType<K extends ConfigKey> =
  (typeof CONFIG_REGISTRY)[K]["default"];

interface ConfigDefinition<T = any> {
  key: ConfigKey;
  default: T;
  sideEffect?: (
    value: T,
    getConfig: <K extends ConfigKey>(key: K) => ConfigValueType<K>,
  ) => void | Promise<void>;
}

export const CONFIG_REGISTRY = {
  autostart: {
    key: "autostart",
    default: false,
    sideEffect: async (value: boolean, _) => {
      if (value) {
        await enable();
      } else {
        await disable();
      }
    },
  },

  notification_detect: {
    key: "notification_detect",
    default: true,
  },

  notification_event: {
    key: "notification_event",
    default: true,
  },

  respect_dnd: {
    key: "respect_dnd",
    default: false,
    sideEffect: async (value: boolean, _) => {
      await detectCommands.setRespectDoNotDisturb(value);
    },
  },

  ignored_platforms: {
    key: "ignored_platforms",
    default: [] as string[],
    sideEffect: async (value: string[], _) => {
      await detectCommands.setIgnoredBundleIds(value);
    },
  },

  mic_active_threshold: {
    key: "mic_active_threshold",
    default: 15,
    sideEffect: async (value: number, _) => {
      await detectCommands.setMicActiveThreshold(value);
    },
  },

  current_stt_provider: {
    key: "current_stt_provider",
    default: undefined,
    sideEffect: async (_value: string | undefined, getConfig) => {
      const provider = getConfig("current_stt_provider") as string | undefined;
      const model = getConfig("current_stt_model") as string | undefined;

      const isLocalProvider =
        (provider === "sherpa" && !!model) ||
        (provider === "openmushi" && model && model !== "cloud");

      if (isLocalProvider) {
        // Server start is handled by the current_stt_model side effect.
        // Only stop the server when switching away from a local provider.
        return;
      }

      await localSttCommands.stopServer(null);
    },
  },

  current_stt_model: {
    key: "current_stt_model",
    default: undefined,
    sideEffect: async (_value: string | undefined, getConfig) => {
      const provider = getConfig("current_stt_provider") as string | undefined;
      const model = getConfig("current_stt_model") as string | undefined;

      const isLocalProvider =
        (provider === "sherpa" && !!model) ||
        (provider === "openmushi" && model && model !== "cloud");

      if (!isLocalProvider) {
        await localSttCommands.stopServer(null);
        return;
      }

      await localSttCommands.startServer(model as SupportedSttModel);
    },
  },

  ai_language: {
    key: "ai_language",
    default: "en",
  },

  spoken_languages: {
    key: "spoken_languages",
    default: ["en"] as string[],
  },

  save_recordings: {
    key: "save_recordings",
    default: true,
  },

  telemetry_consent: {
    key: "telemetry_consent",
    default: true,
    sideEffect: async (value: boolean, _) => {
      await analyticsCommands.setDisabled(!value);
    },
  },

  current_llm_provider: {
    key: "current_llm_provider",
    default: undefined,
  },

  current_llm_model: {
    key: "current_llm_model",
    default: undefined,
  },

  timezone: {
    key: "timezone",
    default: undefined as string | undefined,
  },

  week_start: {
    key: "week_start",
    default: undefined as "sunday" | "monday" | undefined,
  },

  speaker_diarization_enabled: {
    key: "speaker_diarization_enabled",
    default: false,
    sideEffect: async (value: boolean, getConfig) => {
      const model = getConfig("speaker_diarization_model") as
        | SpeakerModel
        | undefined;
      const threshold = getConfig("speaker_similarity_threshold") as number;
      await localSttCommands.setSpeakerConfig(value, model ?? null, threshold);
    },
  },

  speaker_diarization_model: {
    key: "speaker_diarization_model",
    default: undefined as SpeakerModel | undefined,
    sideEffect: async (_value: SpeakerModel | undefined, getConfig) => {
      const enabled = getConfig("speaker_diarization_enabled") as boolean;
      const model = getConfig("speaker_diarization_model") as
        | SpeakerModel
        | undefined;
      const threshold = getConfig("speaker_similarity_threshold") as number;
      await localSttCommands.setSpeakerConfig(
        enabled,
        model ?? null,
        threshold,
      );
    },
  },

  speaker_similarity_threshold: {
    key: "speaker_similarity_threshold",
    default: 0.5,
    sideEffect: async (value: number, getConfig) => {
      const enabled = getConfig("speaker_diarization_enabled") as boolean;
      const model = getConfig("speaker_diarization_model") as
        | SpeakerModel
        | undefined;
      await localSttCommands.setSpeakerConfig(
        enabled,
        model ?? null,
        value,
      );
    },
  },
} satisfies Record<ConfigKey, ConfigDefinition>;
