import { Streamdown } from "streamdown";

import { streamdownComponents } from "@openmushi/tiptap/shared";
import { cn } from "@openmushi/utils";

import { useAITaskTask } from "~/ai/hooks";
import { createTaskId } from "~/store/zustand/ai-task/task-configs";

export function StreamingView({ enhancedNoteId }: { enhancedNoteId: string }) {
  const taskId = createTaskId(enhancedNoteId, "enhance");
  const { streamedText, isGenerating } = useAITaskTask(
    taskId,
    "enhance",
  );

  const hasContent = streamedText.length > 0;

  let statusText: string | null = null;
  if (isGenerating && !hasContent) {
    statusText = "Generating...";
  }

  return (
    <div className="pb-2">
      {statusText ? (
        <p className="text-sm text-neutral-500">{statusText}</p>
      ) : (
        <Streamdown
          components={streamdownComponents}
          className={cn(["flex flex-col"])}
          caret="block"
          isAnimating={isGenerating}
        >
          {streamedText}
        </Streamdown>
      )}
    </div>
  );
}
