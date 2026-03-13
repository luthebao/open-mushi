import type { SessionExtensionDefinition } from "../types";

type ExtensionCardProps = {
  extension: SessionExtensionDefinition;
  runnable: boolean;
  selected: boolean;
  onSelect: (extensionId: string) => void;
};

export function ExtensionCard({
  extension,
  runnable,
  selected,
  onSelect,
}: ExtensionCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(extension.id)}
      className="rounded-md border px-2 py-1 text-left text-xs data-[selected=true]:border-neutral-700 data-[selected=true]:bg-neutral-100"
      data-selected={selected}
      data-runnable={runnable}
      aria-pressed={selected}
      title={extension.description}
    >
      <span className="font-medium">{extension.title}</span>
      {!runnable && <span className="ml-1 text-[10px] text-neutral-500">(locked)</span>}
    </button>
  );
}
