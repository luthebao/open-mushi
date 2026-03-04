import { FolderIcon } from "lucide-react";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@openmushi/ui/components/ui/breadcrumb";
import { Button } from "@openmushi/ui/components/ui/button";

import { SearchableWorkspaceDropdown } from "./shared/folder";

import { WorkspaceBreadcrumb } from "~/shared/ui/workspace-breadcrumb";
import * as main from "~/store/tinybase/store/main";
import { useSessionTitle } from "~/store/zustand/live-title";
import { useTabs } from "~/store/zustand/tabs";

export function FolderChain({ sessionId }: { sessionId: string }) {
  const workspaceId = main.UI.useCell(
    "sessions",
    sessionId,
    "workspace_id",
    main.STORE_ID,
  );
  const storeTitle = main.UI.useCell(
    "sessions",
    sessionId,
    "title",
    main.STORE_ID,
  ) as string | undefined;
  const title = useSessionTitle(sessionId, storeTitle);

  const handleChangeTitle = main.UI.useSetPartialRowCallback(
    "sessions",
    sessionId,
    (title: string) => ({ title }),
    [],
    main.STORE_ID,
  );

  return (
    <Breadcrumb className="ml-1.5 min-w-0">
      <BreadcrumbList className="flex-nowrap gap-0.5 overflow-hidden text-xs text-neutral-700">
        {workspaceId && <FolderIcon className="mr-1 h-3 w-3 shrink-0" />}
        {!workspaceId ? (
          <RenderIfRootNotExist
            title={title}
            handleChangeTitle={handleChangeTitle}
            sessionId={sessionId}
          />
        ) : (
          <RenderIfRootExist
            title={title}
            handleChangeTitle={handleChangeTitle}
            workspaceId={workspaceId}
          />
        )}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

function RenderIfRootExist({
  workspaceId,
  title,
  handleChangeTitle,
}: {
  workspaceId: string;
  title: string;
  handleChangeTitle: (title: string) => void;
}) {
  const openNew = useTabs((state) => state.openNew);

  return (
    <>
      <WorkspaceBreadcrumb
        workspaceId={workspaceId}
        renderSeparator={({ index }) =>
          index > 0 ? <BreadcrumbSeparator className="shrink-0" /> : null
        }
        renderCrumb={({ id, name }) => (
          <BreadcrumbItem className="overflow-hidden">
            <BreadcrumbLink asChild>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openNew({ type: "workspaces", id })}
                className="truncate px-0 text-neutral-600 hover:text-black"
              >
                {name}
              </Button>
            </BreadcrumbLink>
          </BreadcrumbItem>
        )}
      />
      <BreadcrumbSeparator className="shrink-0" />
      <BreadcrumbItem className="overflow-hidden">
        <BreadcrumbPage>
          <TitleInput title={title} handleChangeTitle={handleChangeTitle} />
        </BreadcrumbPage>
      </BreadcrumbItem>
    </>
  );
}

function RenderIfRootNotExist({
  title,
  handleChangeTitle,
  sessionId,
}: {
  title: string;
  handleChangeTitle: (title: string) => void;
  sessionId: string;
}) {
  return (
    <>
      <BreadcrumbItem className="shrink-0">
        <SearchableWorkspaceDropdown
          sessionId={sessionId}
          trigger={
            <button className="text-neutral-500 outline-hidden transition-colors hover:text-neutral-700">
              Select workspace
            </button>
          }
        />
      </BreadcrumbItem>
      <BreadcrumbSeparator className="shrink-0" />
      <BreadcrumbItem className="overflow-hidden">
        <BreadcrumbPage>
          <TitleInput title={title} handleChangeTitle={handleChangeTitle} />
        </BreadcrumbPage>
      </BreadcrumbItem>
    </>
  );
}

function TitleInput({
  title,
  handleChangeTitle,
}: {
  title: string;
  handleChangeTitle: (title: string) => void;
}) {
  return (
    <input
      type="text"
      placeholder="Untitled"
      className="w-full min-w-0 truncate border-none bg-transparent text-neutral-700 focus:underline focus:outline-hidden"
      value={title ?? ""}
      onChange={(e) => handleChangeTitle(e.target.value)}
    />
  );
}
