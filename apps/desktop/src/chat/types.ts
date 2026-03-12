import type { UIMessage } from "ai";
import { z } from "zod";

import type { ContextRef } from "~/chat/context-item";

const contextRefSchema = z.union([
  z.object({
    kind: z.literal("session"),
    key: z.string(),
    source: z.enum(["tool", "manual", "auto-current"]).optional(),
    sessionId: z.string(),
  }),
  z.object({
    kind: z.literal("workspace"),
    key: z.string(),
    source: z.enum(["tool", "manual", "auto-current"]).optional(),
    workspaceId: z.string(),
    workspaceName: z.string().optional(),
  }),
  z.object({
    kind: z.literal("all"),
    key: z.string(),
    source: z.enum(["tool", "manual", "auto-current"]).optional(),
  }),
]);

const messageMetadataSchema = z.object({
  createdAt: z.number().optional(),
  contextRefs: z.array(contextRefSchema).optional(),
});

type MessageMetadata = z.infer<typeof messageMetadataSchema>;
export type AppUIMessage = UIMessage<
  MessageMetadata & { contextRefs?: ContextRef[] }
>;
