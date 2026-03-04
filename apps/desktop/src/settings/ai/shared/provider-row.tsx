import { cn } from "@openmushi/utils";

export function ProviderRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={cn([
        "flex flex-col gap-3",
        "rounded-md border bg-white px-3 py-2",
      ])}
    >
      {children}
    </div>
  );
}
