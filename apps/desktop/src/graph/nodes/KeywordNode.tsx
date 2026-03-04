import { Handle, type NodeProps, Position } from "@xyflow/react";
import { cn } from "@openmushi/utils";

type KeywordNodeData = {
  label: string;
  frequency: number;
  size: number;
  maxFrequency: number;
};

export function KeywordNode({ data, selected }: NodeProps) {
  const { label, frequency, size, maxFrequency } =
    data as unknown as KeywordNodeData;
  const t = maxFrequency > 1 ? Math.min(frequency / maxFrequency, 1) : 0.5;
  const opacity = 0.05 + t * 0.15;

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full border transition-shadow",
        selected
          ? "border-blue-400 shadow-md"
          : "border-neutral-200 hover:border-neutral-300",
      )}
      style={{
        width: size,
        height: size,
        backgroundColor: `rgba(99, 102, 241, ${opacity})`,
      }}
    >
      <Handle type="target" position={Position.Top} className="!invisible" />
      <div className="flex flex-col items-center gap-0.5 px-1">
        <span className="max-w-full truncate text-center text-[10px] leading-tight font-medium text-neutral-700">
          {label}
        </span>
        {frequency > 1 && (
          <span className="text-[9px] leading-none text-neutral-400">
            {frequency}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className="!invisible" />
    </div>
  );
}
