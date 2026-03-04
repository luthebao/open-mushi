import { getIdentifier } from "@tauri-apps/api/app";

// export * from "../shared/config/configure-pro-settings";
// export * from "~/sidebar/timeline/utils";
// export * from "~/stt/segment";

export const id = () => crypto.randomUUID() as string;

export const getScheme = async (): Promise<string> => {
  const id = await getIdentifier();
  const schemes: Record<string, string> = {
    "com.openmushi.stable": "openmushi",
    "com.openmushi.nightly": "openmushi-nightly",
    "com.openmushi.staging": "openmushi-staging",
    "com.openmushi.dev": "openmushi",
  };
  return schemes[id] ?? "openmushi";
};

type DesktopFlowPath = "/auth" | "/app/integration" | "/app/checkout";

export const buildWebAppUrl = async (
  path: DesktopFlowPath,
  params?: Record<string, string>,
): Promise<string> => {
  const { env } = await import("~/env");
  const scheme = await getScheme();
  const url = new URL(path, env.VITE_APP_URL);
  url.searchParams.set("flow", "desktop");
  url.searchParams.set("scheme", scheme);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};

// https://www.rfc-editor.org/rfc/rfc4122#section-4.1.7
export const DEFAULT_USER_ID = "00000000-0000-0000-0000-000000000000";

export const DEVICE_FINGERPRINT_HEADER = "x-device-fingerprint";
export const OPENMUSHI_TASK_HEADER = "x-openmushi-task";
