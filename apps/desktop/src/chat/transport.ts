import {
  type ChatTransport,
  convertToModelMessages,
  type LanguageModel,
  stepCountIs,
  ToolLoopAgent,
  type ToolSet,
} from "ai";

import {
  type SessionContext,
  commands as templateCommands,
} from "@openmushi/plugin-template";

import type { ContextRef } from "./context-item";
import type { AppUIMessage } from "./types";
import { isRecord } from "./utils";

const MAX_TOOL_STEPS = 5;
const MESSAGE_WINDOW_THRESHOLD = 20;
const MESSAGE_WINDOW_SIZE = 10;
export const MAX_EXPANDED_CONTEXTS = 8;

function isContextRef(value: unknown): value is ContextRef {
  if (!isRecord(value) || typeof value.key !== "string") {
    return false;
  }

  if (
    value.source !== undefined &&
    value.source !== "tool" &&
    value.source !== "manual" &&
    value.source !== "auto-current"
  ) {
    return false;
  }

  if (value.kind === "session") {
    return typeof value.sessionId === "string";
  }

  if (value.kind === "workspace") {
    return (
      typeof value.workspaceId === "string" &&
      (value.workspaceName === undefined || typeof value.workspaceName === "string")
    );
  }

  return value.kind === "all";
}

function getContextRefs(metadata: unknown): ContextRef[] {
  if (!isRecord(metadata) || !Array.isArray(metadata.contextRefs)) {
    return [];
  }

  return metadata.contextRefs.filter((ref): ref is ContextRef =>
    isContextRef(ref),
  );
}

export function expandContextRefsForPrompt({
  refs,
  sessionRows,
  cap = MAX_EXPANDED_CONTEXTS,
}: {
  refs: ContextRef[];
  sessionRows: Array<{ id: string; created_at: number; workspace_id: string }>;
  cap?: number;
}): Array<Extract<ContextRef, { kind: "session" }>> {
  const orderedRows = [...sessionRows].sort((a, b) => b.created_at - a.created_at);
  const expanded: Array<Extract<ContextRef, { kind: "session" }>> = [];
  const seen = new Set<string>();

  const pushSession = (sessionId: string) => {
    if (seen.has(sessionId)) return;
    seen.add(sessionId);
    expanded.push({
      kind: "session",
      key: `session:expanded:${sessionId}`,
      source: "manual",
      sessionId,
    });
  };

  for (const ref of refs) {
    if (ref.kind === "session") {
      pushSession(ref.sessionId);
    } else if (ref.kind === "workspace") {
      for (const row of orderedRows) {
        if (row.workspace_id === ref.workspaceId) {
          pushSession(row.id);
          if (expanded.length >= cap) break;
        }
      }
    } else {
      for (const row of orderedRows) {
        pushSession(row.id);
        if (expanded.length >= cap) break;
      }
    }

    if (expanded.length >= cap) {
      break;
    }
  }

  return expanded;
}

export class CustomChatTransport implements ChatTransport<AppUIMessage> {
  constructor(
    private model: LanguageModel,
    private tools: ToolSet,
    private systemPrompt?: string,
    private resolveContextRef?: (
      ref: Extract<ContextRef, { kind: "session" }>,
    ) => Promise<SessionContext | null>,
    private expandContextRefs?: (refs: ContextRef[]) => Promise<ContextRef[]>,
  ) {}

  private async renderContextBlock(
    contextRefs: ContextRef[],
  ): Promise<string | null> {
    if (!this.resolveContextRef || contextRefs.length === 0) {
      return null;
    }

    const seen = new Set<string>();
    const contexts: SessionContext[] = [];
    for (const ref of contextRefs) {
      if (ref.kind !== "session") {
        continue;
      }

      if (seen.has(ref.key)) {
        continue;
      }
      seen.add(ref.key);

      const context = await this.resolveContextRef(ref);
      if (context) {
        contexts.push(context);
      }

      if (contexts.length >= MAX_EXPANDED_CONTEXTS) {
        break;
      }
    }

    if (contexts.length === 0) {
      return null;
    }

    const rendered = await templateCommands.render({
      contextBlock: { contexts },
    });
    return rendered.status === "ok" ? rendered.data : null;
  }

  sendMessages: ChatTransport<AppUIMessage>["sendMessages"] = async (
    options,
  ) => {
    const agent = new ToolLoopAgent({
      model: this.model,
      instructions: this.systemPrompt,
      tools: this.tools,
      stopWhen: stepCountIs(MAX_TOOL_STEPS),
      prepareStep: async ({ messages }) => {
        if (messages.length > MESSAGE_WINDOW_THRESHOLD) {
          return { messages: messages.slice(-MESSAGE_WINDOW_SIZE) };
        }

        return {};
      },
    });

    const contextBlockCache = new Map<string, string | null>();
    const messagesWithContext: AppUIMessage[] = [];
    for (const msg of options.messages) {
      if (msg.role !== "user") {
        messagesWithContext.push(msg);
        continue;
      }

      const contextRefs = getContextRefs(msg.metadata);
      if (contextRefs.length === 0) {
        messagesWithContext.push(msg);
        continue;
      }

      const expandedContextRefs = this.expandContextRefs
        ? await this.expandContextRefs(contextRefs)
        : contextRefs;

      const cacheKey = JSON.stringify(expandedContextRefs);
      let contextBlock = contextBlockCache.get(cacheKey);
      if (contextBlock === undefined) {
        contextBlock = await this.renderContextBlock(expandedContextRefs);
        contextBlockCache.set(cacheKey, contextBlock);
      }

      if (!contextBlock) {
        messagesWithContext.push(msg);
        continue;
      }

      messagesWithContext.push({
        ...msg,
        parts: [
          {
            type: "text" as const,
            text: `${contextBlock}\n\n`,
          },
          ...msg.parts,
        ],
      });
    }

    const result = await agent.stream({
      messages: await convertToModelMessages(messagesWithContext),
    });

    return result.toUIMessageStream({
      originalMessages: options.messages,
      messageMetadata: ({ part }: { part: { type: string } }) => {
        if (part.type === "start") {
          return { createdAt: Date.now() };
        }
      },
      onError: (error: unknown) => {
        console.error(error);
        if (error instanceof Error) {
          return `${error.name}: ${error.message}`;
        }
        if (isRecord(error) && typeof error.message === "string") {
          return error.message;
        }
        try {
          return JSON.stringify(error);
        } catch {
          return String(error);
        }
      },
    });
  };

  reconnectToStream: ChatTransport<AppUIMessage>["reconnectToStream"] =
    async () => {
      return null;
    };
}
