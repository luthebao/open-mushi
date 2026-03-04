import { useMCP } from "./useMCP";

export function useResearchMCP(enabled: boolean, accessToken?: string | null) {
  return useMCP({
    enabled,
    endpoint: "/research/mcp",
    clientName: "openmushi-research-client",
    accessToken,
    promptName: "research_chat",
  });
}
