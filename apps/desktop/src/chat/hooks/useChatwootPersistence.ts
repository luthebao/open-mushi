// Cloud chatwoot integration removed. This hook is stubbed as a no-op.

export function useChatwootPersistence(
  _userId: string | undefined,
  _contactInfo?: {
    email?: string;
    name?: string;
    customAttributes?: Record<string, unknown>;
  },
) {
  return {
    sourceId: null as string | null,
    pubsubToken: null as string | null,
    conversationId: null as number | null,
    startConversation: async () => null as number | null,
    persistMessage: async (
      _content: string,
      _messageType: "incoming" | "outgoing",
    ) => {},
    isReady: false,
  };
}
