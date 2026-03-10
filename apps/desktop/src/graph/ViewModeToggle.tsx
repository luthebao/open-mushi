import { cn } from "@openmushi/utils";

export type ViewMode = "2d" | "3d";

type ViewModeToggleProps = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
};

export function ViewModeToggle({ mode, onChange }: ViewModeToggleProps) {
  return (
    <div className="flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5">
      <button
        onClick={() => onChange("2d")}
        className={cn(
          "rounded-md px-3 py-1 text-xs font-medium transition-colors",
          mode === "2d"
            ? "bg-white text-neutral-900 shadow-sm"
            : "text-neutral-500 hover:text-neutral-700",
        )}
      >
        2D
      </button>
      <button
        onClick={() => onChange("3d")}
        className={cn(
          "rounded-md px-3 py-1 text-xs font-medium transition-colors",
          mode === "3d"
            ? "bg-white text-neutral-900 shadow-sm"
            : "text-neutral-500 hover:text-neutral-700",
        )}
      >
        3D
      </button>
    </div>
  );
}
