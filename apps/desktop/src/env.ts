import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_APP_VERSION: z.string().min(1).optional(),
    VITE_API_URL: z.string().url().optional().default("http://localhost:3001"),
    VITE_APP_URL: z.string().url().optional().default("http://localhost:3000"),
    VITE_SUPABASE_URL: z.string().url().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
