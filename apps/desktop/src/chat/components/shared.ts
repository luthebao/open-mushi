import type { AppUIMessage } from "~/chat/types";

export function hasRenderableContent(message: AppUIMessage): boolean {
  return message.parts.some((part) => part.type !== "step-start");
}
