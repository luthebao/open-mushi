import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OuterHeader } from "./index";

vi.mock("./listen", () => ({
  ListenButton: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="listen">listen-{sessionId}</div>
  ),
}));

vi.mock("./folder", () => ({
  FolderChain: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="folder">folder-{sessionId}</div>
  ),
}));

vi.mock("./metadata", () => ({
  MetadataButton: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="metadata">metadata-{sessionId}</div>
  ),
}));

vi.mock("./overflow", () => ({
  OverflowButton: ({ sessionId }: { sessionId: string }) => (
    <div data-testid="overflow">overflow-{sessionId}</div>
  ),
}));

describe("OuterHeader", () => {
  it("prioritizes recording controls before workspace metadata", () => {
    const { getByTestId } = render(
      <OuterHeader sessionId="session-1" currentView={{ type: "raw" }} />,
    );

    const listen = getByTestId("listen");
    const folder = getByTestId("folder");

    expect(listen.compareDocumentPosition(folder)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });
});
