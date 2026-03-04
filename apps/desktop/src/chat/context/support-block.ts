import type { AccountInfo, DeviceInfo } from "@openmushi/plugin-template";
import { commands as miscCommands } from "@openmushi/plugin-misc";
import { commands as templateCommands } from "@openmushi/plugin-template";

import type { ContextEntity } from "~/chat/context-item";

async function getAccountInfo(): Promise<AccountInfo | null> {
  // Auth plugin cloud commands removed; return null in local-only mode
  return null;
}

async function getDeviceInfo(): Promise<DeviceInfo | null> {
  try {
    const result = await miscCommands.getDeviceInfo(navigator.language || "en");
    if (result.status === "ok") {
      return result.data;
    }
  } catch (error) {
    console.error("Failed to collect device info:", error);
  }
  return null;
}

export async function collectSupportContextBlock(): Promise<{
  entities: ContextEntity[];
  block: string | null;
}> {
  const [accountInfo, deviceInfo] = await Promise.all([
    getAccountInfo(),
    getDeviceInfo(),
  ]);

  const entities: ContextEntity[] = [];

  if (accountInfo) {
    entities.push({ kind: "account", key: "support:account", ...accountInfo });
  }

  if (deviceInfo) {
    entities.push({ kind: "device", key: "support:device", ...deviceInfo });
  }

  if (!deviceInfo) {
    return { entities, block: null };
  }

  const result = await templateCommands.renderSupport({
    supportContext: { account: accountInfo, device: deviceInfo },
  });

  return {
    entities,
    block: result.status === "ok" ? result.data : null,
  };
}
