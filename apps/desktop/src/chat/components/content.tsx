import type { ChatStatus } from "ai";
import { useMemo } from "react";

import { ChatBody } from "./body";
import { ContextBar } from "./context-bar";
import { ChatMessageInput, type McpIndicator } from "./input";

import type { useLanguageModel } from "~/ai/hooks";
import type { ContextEntity, ContextRef } from "~/chat/context-item";
import type { AppUIMessage } from "~/chat/types";

function toContextRefs(entities: ContextEntity[]): ContextRef[] {
  return entities.flatMap((e): ContextRef[] => {
    if (e.kind === "session") {
      return [{
        kind: e.kind,
        key: e.key,
        source: e.source,
        sessionId: e.sessionId,
      }];
    }

    if (e.kind === "workspace") {
      return [{
        kind: e.kind,
        key: e.key,
        source: e.source,
        workspaceId: e.workspaceId,
        workspaceName: e.workspaceName,
      }];
    }

    if (e.kind === "all") {
      return [{ kind: e.kind, key: e.key, source: e.source }];
    }

    return [];
  });
}

export function ChatContent({
  sessionId,
  messages,
  sendMessage,
  regenerate,
  stop,
  status,
  error,
  model,
  handleSendMessage,
  contextEntities,
  onRemoveContextEntity,
  onAddContextEntity,
  isSystemPromptReady,
  mcpIndicator,
  children,
}: {
  sessionId: string;
  messages: AppUIMessage[];
  sendMessage: (message: AppUIMessage) => void;
  regenerate: () => void;
  stop: () => void;
  status: ChatStatus;
  error?: Error;
  model: ReturnType<typeof useLanguageModel>;
  handleSendMessage: (
    content: string,
    parts: AppUIMessage["parts"],
    sendMessage: (message: AppUIMessage) => void,
    contextRefs?: ContextRef[],
  ) => void;
  contextEntities: ContextEntity[];
  onRemoveContextEntity?: (key: string) => void;
  onAddContextEntity?: (ref: ContextRef) => void;
  isSystemPromptReady: boolean;
  mcpIndicator?: McpIndicator;
  children?: React.ReactNode;
}) {
  const contextRefs = useMemo(
    () => toContextRefs(contextEntities),
    [contextEntities],
  );

  const disabled =
    !model ||
    status !== "ready" ||
    (status === "ready" && !isSystemPromptReady);

  return (
    <>
      {children ?? (
        <ChatBody
          messages={messages}
          status={status}
          error={error}
          onReload={regenerate}
          isModelConfigured={!!model}
        />
      )}
      <ContextBar
        entities={contextEntities}
        onRemoveEntity={onRemoveContextEntity}
        onAddEntity={onAddContextEntity}
      />
      <ChatMessageInput
        draftKey={sessionId}
        disabled={disabled}
        hasContextBar={contextEntities.length > 0}
        onSendMessage={(content, parts) => {
          handleSendMessage(content, parts, sendMessage, contextRefs);
        }}
        isStreaming={status === "streaming" || status === "submitted"}
        onStop={stop}
        mcpIndicator={mcpIndicator}
      />
    </>
  );
}
