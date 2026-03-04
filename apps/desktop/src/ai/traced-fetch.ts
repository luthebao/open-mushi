import { fetch as tauriFetch } from "@tauri-apps/plugin-http";

import { commands as miscCommands } from "@openmushi/plugin-misc";

import { DEVICE_FINGERPRINT_HEADER } from "~/shared/utils";

let cachedFingerprint: string | null = null;

const getFingerprint = async (): Promise<string | null> => {
  if (cachedFingerprint) return cachedFingerprint;

  const result = await miscCommands.getFingerprint();
  if (result.status === "ok") {
    cachedFingerprint = result.data;
    return cachedFingerprint;
  }
  return null;
};

export const tracedFetch: typeof fetch = async (input, init) => {
  const headers = new Headers(init?.headers);

  const fingerprint = await getFingerprint();
  if (fingerprint) {
    headers.set(DEVICE_FINGERPRINT_HEADER, fingerprint);
  }

  const response = await tauriFetch(input, { ...init, headers });
  return response;
};

export function createTracedFetch(task: string): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set("x-char-task", task);
    return tracedFetch(input, { ...init, headers });
  };
}
