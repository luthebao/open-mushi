import { events as appleCalendarEvents } from "@openmushi/plugin-apple-calendar";
import { events as deeplinkEvents } from "@openmushi/plugin-deeplink2";
import { events as detectEvents } from "@openmushi/plugin-detect";
import { events as listenerEvents } from "@openmushi/plugin-listener";
import { events as localSttEvents } from "@openmushi/plugin-local-stt";
import { events as networkEvents } from "@openmushi/plugin-network";
import { events as notificationEvents } from "@openmushi/plugin-notification";
import { events as notifyEvents } from "@openmushi/plugin-notify";
import { events as updaterEvents } from "@openmushi/plugin-updater2";
import { events as windowsEvents } from "@openmushi/plugin-windows";

export const pluginEvents = {
  tauri: {
    appleCalendar: appleCalendarEvents,
    deeplink2: deeplinkEvents,
    detect: detectEvents,
    listener: listenerEvents,
    localStt: localSttEvents,
    network: networkEvents,
    notification: notificationEvents,
    notify: notifyEvents,
    updater2: updaterEvents,
    windows: windowsEvents,
  },
};
