import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Check,
  Download,
  Loader2,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  commands as localSttCommands,
  events as localSttEvents,
  type SpeakerModel,
} from "@openmushi/plugin-local-stt";
import { Switch } from "@openmushi/ui/components/ui/switch";
import { cn } from "@openmushi/utils";

import { ProviderRow } from "~/settings/ai/shared/provider-row";
import * as settings from "~/store/tinybase/store/settings";

const speakerModelKeys = {
  all: ["speaker-model"] as const,
  downloaded: (model: SpeakerModel) =>
    [...speakerModelKeys.all, model, "downloaded"] as const,
  downloading: (model: SpeakerModel) =>
    [...speakerModelKeys.all, model, "downloading"] as const,
};

function useSpeakerModelDownload(
  model: SpeakerModel,
  onDownloadComplete?: (model: SpeakerModel) => void,
) {
  const [progress, setProgress] = useState<number>(0);
  const [isStarting, setIsStarting] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isDownloaded = useQuery({
    refetchInterval: 1000,
    queryKey: speakerModelKeys.downloaded(model),
    queryFn: () => localSttCommands.isSpeakerModelDownloaded(model),
    select: (result) => {
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
  });

  const isDownloading = useQuery({
    refetchInterval: 1000,
    queryKey: speakerModelKeys.downloading(model),
    queryFn: () => localSttCommands.isSpeakerModelDownloading(model),
    select: (result) => {
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
  });

  const showProgress =
    !isDownloaded.data && (isStarting || (isDownloading.data ?? false));

  useEffect(() => {
    if (isDownloading.data) setIsStarting(false);
  }, [isDownloading.data]);

  useEffect(() => {
    const unlisten =
      localSttEvents.speakerDownloadProgressPayload.listen((event) => {
        if (event.payload.model === model) {
          if (event.payload.progress < 0) {
            setHasError(true);
            setIsStarting(false);
            setProgress(0);
          } else {
            setHasError(false);
            setProgress(
              Math.max(0, Math.min(100, event.payload.progress)),
            );
          }
        }
      });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [model]);

  useEffect(() => {
    if (isDownloaded.data && progress > 0) {
      setProgress(0);
      onDownloadComplete?.(model);
    }
  }, [isDownloaded.data, model, onDownloadComplete, progress]);

  const handleDownload = useCallback(() => {
    if (isDownloaded.data || isDownloading.data || isStarting) return;
    setHasError(false);
    setIsStarting(true);
    setProgress(0);
    void localSttCommands.downloadSpeakerModel(model).then((result) => {
      if (result.status === "error") {
        setHasError(true);
        setIsStarting(false);
      }
    });
  }, [isDownloaded.data, isDownloading.data, isStarting, model]);

  const handleCancel = useCallback(() => {
    void localSttCommands.cancelSpeakerDownload(model);
    setIsStarting(false);
    setProgress(0);
  }, [model]);

  const handleDelete = useCallback(() => {
    void localSttCommands.deleteSpeakerModel(model).then((result) => {
      if (result.status === "ok") void isDownloaded.refetch();
    });
  }, [model, isDownloaded]);

  return {
    progress,
    hasError,
    isDownloaded: isDownloaded.data ?? false,
    showProgress,
    handleDownload,
    handleCancel,
    handleDelete,
  };
}

function useSegmentationModel() {
  const [isDownloading, setIsDownloading] = useState(false);
  const [hasError, setHasError] = useState(false);

  const isDownloaded = useQuery({
    refetchInterval: 1000,
    queryKey: ["segmentation-model", "downloaded"],
    queryFn: () => localSttCommands.isSegmentationModelDownloaded(),
    select: (result) => {
      if (result.status === "error") throw new Error(result.error);
      return result.data;
    },
  });

  const handleDownload = useCallback(() => {
    if (isDownloaded.data || isDownloading) return;
    setHasError(false);
    setIsDownloading(true);
    void localSttCommands.downloadSegmentationModel().then((result) => {
      setIsDownloading(false);
      if (result.status === "error") {
        setHasError(true);
      }
    });
  }, [isDownloaded.data, isDownloading]);

  const handleDelete = useCallback(() => {
    void localSttCommands.deleteSegmentationModel().then((result) => {
      if (result.status === "ok") void isDownloaded.refetch();
    });
  }, [isDownloaded]);

  return {
    isDownloaded: isDownloaded.data ?? false,
    isDownloading,
    hasError,
    handleDownload,
    handleDelete,
  };
}

export function SpeakerDiarization() {
  const enabled =
    settings.UI.useValue("speaker_diarization_enabled", settings.STORE_ID) ??
    false;
  const selectedModel = settings.UI.useValue(
    "speaker_diarization_model",
    settings.STORE_ID,
  ) as SpeakerModel | undefined;
  const threshold =
    (settings.UI.useValue(
      "speaker_similarity_threshold",
      settings.STORE_ID,
    ) as number) ?? 0.5;

  const setEnabled = settings.UI.useSetValueCallback(
    "speaker_diarization_enabled",
    (v: boolean) => v,
    [],
    settings.STORE_ID,
  );

  const setModel = settings.UI.useSetValueCallback(
    "speaker_diarization_model",
    (v: SpeakerModel) => v,
    [],
    settings.STORE_ID,
  );

  const setThreshold = settings.UI.useSetValueCallback(
    "speaker_similarity_threshold",
    (v: number) => v,
    [],
    settings.STORE_ID,
  );

  const models = useQuery({
    queryKey: ["speaker-models-list"],
    queryFn: async () => {
      const result = await localSttCommands.listSpeakerModels();
      return result.status === "ok" ? result.data : [];
    },
    staleTime: Infinity,
  });

  return (
    <div className="flex flex-col gap-6 pt-4">
      <div>
        <h3 className="text-md font-serif font-semibold">
          Speaker Diarization
        </h3>
        <p className="mt-1 text-xs text-neutral-500">
          Identify who spoke when across full audio. Uses segmentation and
          embedding models to cluster speakers during batch transcription.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-xl border border-neutral-200 bg-neutral-50 p-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            Enable Speaker Diarization
          </span>
          <span className="text-xs text-neutral-500">
            Identify different speakers in imported audio files
          </span>
        </div>
        <Switch checked={!!enabled} onCheckedChange={setEnabled} />
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium">Segmentation Model</h4>
        <p className="text-xs text-neutral-500">
          Required for speaker diarization. Downloads automatically if not
          present.
        </p>
        <SegmentationModelRow />
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium">Embedding Models</h4>
        <p className="text-xs text-neutral-500">
          Used for speaker embedding extraction during diarization. Choose one.
        </p>
        <div className="flex flex-col gap-3">
          {models.data?.map((model) => (
            <SpeakerModelRow
              key={model.key}
              model={model.key}
              displayName={model.display_name}
              description={model.description}
              sizeBytes={model.size_bytes}
              isSelected={selectedModel === model.key}
              onSelect={() => setModel(model.key)}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h4 className="text-sm font-medium">Clustering Threshold</h4>
        <p className="text-xs text-neutral-500">
          Controls speaker clustering sensitivity. Higher values require closer
          matches, resulting in fewer unique speakers detected.
        </p>
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="flex-1"
          />
          <span className="w-10 text-right font-mono text-sm text-neutral-600">
            {threshold.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
}

function SegmentationModelRow() {
  const { isDownloaded, isDownloading, hasError, handleDownload, handleDelete } =
    useSegmentationModel();

  return (
    <ProviderRow>
      <div className="flex flex-1 items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Pyannote v3.0</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
              ~17 MB
            </span>
          </div>
          <span className="text-xs text-neutral-500">
            Segmentation model for detecting speaker turns
          </span>
        </div>
      </div>

      {isDownloaded ? (
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-green-600">
            <Check className="size-3.5" />
            Ready
          </span>
          <button
            onClick={handleDelete}
            title="Delete Model"
            className={cn([
              "size-8.5 rounded-full",
              "bg-linear-to-t from-red-200 to-red-100 text-red-600",
              "shadow-xs hover:from-red-300 hover:to-red-200 hover:shadow-md",
              "transition-all duration-150",
              "flex items-center justify-center",
            ])}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      ) : hasError ? (
        <button
          onClick={handleDownload}
          className={cn([
            "h-8.5 w-fit rounded-full px-4 text-center font-mono text-xs",
            "bg-linear-to-t from-red-600 to-red-500 text-white",
            "shadow-md hover:scale-[102%] hover:shadow-lg active:scale-[98%]",
            "transition-all duration-150",
            "flex items-center justify-center gap-1.5",
          ])}
        >
          <AlertCircle className="size-4" />
          <span>Retry</span>
        </button>
      ) : isDownloading ? (
        <div
          className={cn([
            "h-8.5 w-fit rounded-full px-4 text-center font-mono text-xs",
            "bg-linear-to-t from-neutral-300 to-neutral-200 text-neutral-900",
            "shadow-xs",
            "flex items-center justify-center gap-1.5",
          ])}
        >
          <Loader2 className="size-4 animate-spin" />
          <span>Downloading</span>
        </div>
      ) : (
        <button
          onClick={handleDownload}
          className={cn([
            "h-8.5 w-fit rounded-full px-4 text-center font-mono text-xs",
            "bg-linear-to-t from-neutral-200 to-neutral-100 text-neutral-900",
            "shadow-xs hover:scale-[102%] hover:shadow-md active:scale-[98%]",
            "transition-all duration-150",
            "flex items-center justify-center gap-1.5",
          ])}
        >
          <Download className="size-4" />
          <span>Download</span>
        </button>
      )}
    </ProviderRow>
  );
}

function SpeakerModelRow({
  model,
  displayName,
  description,
  sizeBytes,
  isSelected,
  onSelect,
}: {
  model: SpeakerModel;
  displayName: string;
  description: string;
  sizeBytes: number;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const onDownloadComplete = useCallback(
    (_m: SpeakerModel) => {
      onSelect();
    },
    [onSelect],
  );

  const {
    progress,
    hasError,
    isDownloaded,
    showProgress,
    handleDownload,
    handleCancel,
    handleDelete,
  } = useSpeakerModelDownload(model, onDownloadComplete);

  const sizeMB = (sizeBytes / 1_000_000).toFixed(0);

  return (
    <ProviderRow>
      <button
        type="button"
        className="flex flex-1 items-start gap-3 text-left"
        onClick={() => {
          if (isDownloaded) onSelect();
        }}
      >
        <div
          className={cn([
            "mt-0.5 h-4 w-4 shrink-0 rounded-full border-2",
            isSelected
              ? "border-neutral-800 bg-neutral-800"
              : "border-neutral-300 bg-white",
          ])}
        >
          {isSelected && (
            <div className="flex h-full items-center justify-center">
              <div className="h-1.5 w-1.5 rounded-full bg-white" />
            </div>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{displayName}</span>
            <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] text-neutral-500">
              {sizeMB} MB
            </span>
          </div>
          <span className="text-xs text-neutral-500">{description}</span>
        </div>
      </button>

      <SpeakerModelAction
        isDownloaded={isDownloaded}
        showProgress={showProgress}
        progress={progress}
        hasError={hasError}
        onDownload={handleDownload}
        onCancel={handleCancel}
        onDelete={handleDelete}
      />
    </ProviderRow>
  );
}

function SpeakerModelAction({
  isDownloaded,
  showProgress,
  progress,
  hasError,
  onDownload,
  onCancel,
  onDelete,
}: {
  isDownloaded: boolean;
  showProgress: boolean;
  progress: number;
  hasError: boolean;
  onDownload: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  if (isDownloaded) {
    return (
      <button
        onClick={onDelete}
        title="Delete Model"
        className={cn([
          "size-8.5 rounded-full",
          "bg-linear-to-t from-red-200 to-red-100 text-red-600",
          "shadow-xs hover:from-red-300 hover:to-red-200 hover:shadow-md",
          "transition-all duration-150",
          "flex items-center justify-center",
        ])}
      >
        <Trash2 className="size-4" />
      </button>
    );
  }

  if (hasError) {
    return (
      <button
        onClick={onDownload}
        className={cn([
          "h-8.5 w-fit rounded-full px-4 text-center font-mono text-xs",
          "bg-linear-to-t from-red-600 to-red-500 text-white",
          "shadow-md hover:scale-[102%] hover:shadow-lg active:scale-[98%]",
          "transition-all duration-150",
          "flex items-center justify-center gap-1.5",
        ])}
      >
        <AlertCircle className="size-4" />
        <span>Retry</span>
      </button>
    );
  }

  if (showProgress) {
    return (
      <button
        onClick={onCancel}
        className={cn([
          "group relative overflow-hidden",
          "h-8.5 w-27.5 rounded-full px-4 text-center font-mono text-xs",
          "bg-linear-to-t from-neutral-300 to-neutral-200 text-neutral-900",
          "shadow-xs",
          "transition-all duration-150",
        ])}
      >
        <div
          className="absolute inset-0 rounded-full bg-neutral-400/50 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
        <div className="relative z-10 flex items-center justify-center gap-1.5 group-hover:hidden">
          <Loader2 className="size-4 animate-spin" />
          <span>{Math.round(progress)}%</span>
        </div>
        <div className="relative z-10 hidden items-center justify-center gap-1.5 group-hover:flex">
          <X className="size-4" />
          <span>Cancel</span>
        </div>
      </button>
    );
  }

  return (
    <button
      onClick={onDownload}
      className={cn([
        "h-8.5 w-fit rounded-full px-4 text-center font-mono text-xs",
        "bg-linear-to-t from-neutral-200 to-neutral-100 text-neutral-900",
        "shadow-xs hover:scale-[102%] hover:shadow-md active:scale-[98%]",
        "transition-all duration-150",
        "flex items-center justify-center gap-1.5",
      ])}
    >
      <Download className="size-4" />
      <span>Download</span>
    </button>
  );
}
