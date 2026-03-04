import { type ReactNode, useMemo } from "react";

export function WorkspaceBreadcrumb({
  workspaceId,
  renderBefore,
  renderAfter,
  renderSeparator,
  renderCrumb,
}: {
  workspaceId: string;
  renderBefore?: () => ReactNode;
  renderAfter?: () => ReactNode;
  renderSeparator?: (props: { index: number }) => ReactNode;
  renderCrumb: (props: {
    id: string;
    name: string;
    isLast: boolean;
  }) => ReactNode;
}) {
  const workspaceChain = useWorkspaceChain(workspaceId);

  if (workspaceChain.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-row items-center gap-1">
      {renderBefore?.()}
      {workspaceChain.map((id, index) => (
        <div key={id} className="flex flex-row items-center gap-1">
          {renderSeparator ? (
            renderSeparator({ index })
          ) : index > 0 || renderBefore ? (
            <span>/</span>
          ) : null}
          <WorkspaceWrapper
            workspaceId={id}
            isLast={index === workspaceChain.length - 1}
          >
            {({ id, name, isLast }) => {
              return renderCrumb({ id, name, isLast });
            }}
          </WorkspaceWrapper>
        </div>
      ))}
      {renderAfter?.()}
    </div>
  );
}

function WorkspaceWrapper({
  workspaceId,
  isLast,
  children,
}: {
  workspaceId: string;
  isLast: boolean;
  children: (props: {
    id: string;
    name: string;
    isLast: boolean;
  }) => ReactNode;
}) {
  const name = useMemo(() => {
    const parts = workspaceId.split("/");
    return parts[parts.length - 1] || "Untitled";
  }, [workspaceId]);

  return (
    <>
      {children({
        id: workspaceId,
        name,
        isLast,
      })}
    </>
  );
}

export function useWorkspaceChain(workspaceId: string) {
  return useMemo(() => {
    if (!workspaceId) return [];
    const parts = workspaceId.split("/").filter(Boolean);
    return parts.map((_, i) => parts.slice(0, i + 1).join("/"));
  }, [workspaceId]);
}
