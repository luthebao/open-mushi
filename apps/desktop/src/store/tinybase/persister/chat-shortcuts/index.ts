import * as _UI from "tinybase/ui-react/with-schemas";

import { getCurrentWebviewWindowLabel } from "@openmushi/plugin-windows";
import { type Schemas } from "@openmushi/store";

import { createChatShortcutPersister } from "./persister";

import type { Store } from "~/store/tinybase/store/main";

const { useCreatePersister } = _UI as _UI.WithSchemas<Schemas>;

export function useChatShortcutPersister(store: Store) {
  return useCreatePersister(
    store,
    async (store) => {
      const persister = createChatShortcutPersister(store as Store);
      if (getCurrentWebviewWindowLabel() === "main") {
        await persister.startAutoPersisting();
      } else {
        await persister.startAutoLoad();
      }
      return persister;
    },
    [],
  );
}
