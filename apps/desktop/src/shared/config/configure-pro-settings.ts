import * as settings from "~/store/tinybase/store/settings";

type SettingsStore = NonNullable<ReturnType<typeof settings.UI.useStore>>;

// No-op: cloud provider is not available in local-only mode.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function configureProSettings(_store: SettingsStore): void {}
