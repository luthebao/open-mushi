import type { SessionExtensionDefinition } from "../types";

type ExtensionDetailsPanelProps = {
  extension: SessionExtensionDefinition | null;
  runnable: boolean;
  onRun: (extensionId: string) => void;
};

export function ExtensionDetailsPanel({
  extension,
  runnable,
  onRun,
}: ExtensionDetailsPanelProps) {
  if (!extension) {
    return null;
  }

  return (
    <div
      className="rounded-md border border-neutral-200 bg-white px-2 py-1.5"
      data-testid="extension-details-panel"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-xs font-medium">{extension.title}</div>
          <p className="truncate text-[11px] text-neutral-600">{extension.description}</p>
        </div>
        <button
          type="button"
          onClick={() => onRun(extension.id)}
          disabled={!runnable}
          className="shrink-0 rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-medium text-white disabled:opacity-50"
        >
          {runnable ? "Run" : "Locked"}
        </button>
      </div>
    </div>
  );
}
