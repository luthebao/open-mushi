import { cn } from "@openmushi/utils";

export function NoteTab({
  isActive,
  onClick,
  className,
  children,
}: {
  isActive: boolean;
  onClick?: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn([
        "relative my-2 shrink-0 border-b-2 px-1 py-0.5 text-xs font-medium transition-all duration-200",
        isActive
          ? ["border-neutral-900", "text-neutral-900"]
          : [
              "border-transparent",
              "text-neutral-600",
              "hover:text-neutral-800",
            ],
        className,
      ])}
    >
      <span className="flex h-5 items-center gap-1">{children}</span>
    </div>
  );
}
