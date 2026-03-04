import "./styles/globals.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { Provider as TinyBaseProvider, useStores } from "tinybase/ui-react";
import { createManager } from "tinytick";
import {
  Provider as TinyTickProvider,
  useCreateManager,
} from "tinytick/ui-react";

import { init as initWindowsPlugin } from "@openmushi/plugin-windows";
import "@openmushi/ui/globals.css";

import { createToolRegistry } from "./contexts/tool-registry/core";
import { initPluginGlobals } from "./plugins/globals";
import { routeTree } from "./routeTree.gen";
import { TaskManager } from "./services/task-manager";
import { ErrorComponent, NotFoundComponent } from "./shared/control";
import { EventListeners } from "./shared/event-listeners";
import {
  type Store,
  STORE_ID,
  StoreComponent,
} from "./store/tinybase/store/main";
import {
  STORE_ID as SETTINGS_STORE_ID,
  type Store as SettingsStore,
  StoreComponent as SettingsStoreComponent,
} from "./store/tinybase/store/settings";
import { createAITaskStore } from "./store/zustand/ai-task";
import { listenerStore } from "./store/zustand/listener/instance";

const toolRegistry = createToolRegistry();
const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  context: undefined,
  defaultErrorComponent: ErrorComponent,
  defaultNotFoundComponent: NotFoundComponent,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function App() {
  const stores = useStores();

  const store = stores[STORE_ID] as unknown as Store;
  const settingsStore = stores[SETTINGS_STORE_ID] as unknown as SettingsStore;

  const aiTaskStore = useMemo(() => {
    if (!store || !settingsStore) {
      return null;
    }
    return createAITaskStore({ persistedStore: store, settingsStore });
  }, [store, settingsStore]);

  if (!store || !settingsStore || !aiTaskStore) {
    return null;
  }

  return (
    <RouterProvider
      router={router}
      context={{
        persistedStore: store,
        internalStore: store,
        listenerStore,
        aiTaskStore,
        toolRegistry,
      }}
    />
  );
}

function AppWithTiny() {
  const manager = useCreateManager(() => {
    return createManager().start();
  });

  return (
    <QueryClientProvider client={queryClient}>
      <TinyTickProvider manager={manager}>
        <TinyBaseProvider>
          <StoreComponent />
          <SettingsStoreComponent />
          <App />
          <TaskManager />
          <EventListeners />
        </TinyBaseProvider>
      </TinyTickProvider>
    </QueryClientProvider>
  );
}

initWindowsPlugin();
initPluginGlobals();

const rootElement = document.getElementById("root")!;
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <AppWithTiny />
    </StrictMode>,
  );
}
