import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NoteTab } from "@openmushi/ui/components/ui/note-tab";

describe("NoteTab", () => {
  it("does not nest button elements when tab has an inline action button", () => {
    const onTabClick = vi.fn();
    const onActionClick = vi.fn();

    const { container, getByLabelText } = render(
      <NoteTab isActive={true} onClick={onTabClick}>
        Summary
        <button
          type="button"
          aria-label="Regenerate enhanced note"
          onClick={(e) => {
            e.stopPropagation();
            onActionClick();
          }}
        >
          R
        </button>
      </NoteTab>,
    );

    expect(container.querySelector("button button")).toBeNull();

    fireEvent.click(getByLabelText("Regenerate enhanced note"));
    expect(onActionClick).toHaveBeenCalledTimes(1);
    expect(onTabClick).toHaveBeenCalledTimes(0);
  });
});
