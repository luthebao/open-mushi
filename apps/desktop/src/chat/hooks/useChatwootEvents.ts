// Cloud chatwoot integration removed. This hook is stubbed as a no-op.

export function useChatwootEvents(_options: {
  pubsubToken: string | null;
  conversationId: number | null;
  onAgentMessage: (content: string, senderName: string) => void;
}) {
  // No-op: chatwoot events stream is not available without cloud backend
}
