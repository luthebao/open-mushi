import { useQuery } from "@tanstack/react-query";

type Connection = {
  integration_id: string;
  connection_id: string;
};

export function useConnections() {
  return useQuery<Connection[]>({
    queryKey: ["integration-status"],
    queryFn: async () => {
      // No cloud connections in local-only mode
      return [];
    },
    enabled: false,
  });
}
