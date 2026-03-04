import { type ReactNode } from "react";

import { cn } from "@openmushi/utils";

export function Section({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn([
          "px-3 py-1",
          "flex items-center justify-between",
        ])}
      >
        <div className="flex items-center gap-2 text-neutral-400">
          {icon}
          <h3 className="text-xs font-medium uppercase tracking-wider">{title}</h3>
        </div>
        {action}
      </div>

      {children}
    </div>
  );
}
