/**
 * ExplorerClient tests.
 *
 * Focused on the small but important behaviors layered on top of the page:
 *   - on mount, the client calls router.refresh() so a freshly-saved line
 *     (from /build or /gaps) doesn't sit behind the RSC router cache.
 *   - the Board renders with hideHistoryOverlay so the "Viewing move
 *     history" curtain doesn't cover a loaded game while scrubbing.
 *
 * Board, MobileNav, Logo, react-chessboard, etc. are stubbed — they have
 * their own coverage and would dwarf this suite otherwise.
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import ExplorerClient from "@/components/ExplorerClient";

const mockRefresh = jest.fn();
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

// Capture the props Board receives so we can assert `hideHistoryOverlay`.
jest.mock("@/components/Board", () => {
  const React = require("react");
  const Board = React.forwardRef(
    (props: Record<string, unknown>, _ref: React.Ref<unknown>) => {
      (globalThis as any).__lastBoardProps = props;
      return <div data-testid="explorer-board" />;
    },
  );
  return { __esModule: true, Board };
});
jest.mock("@/components/MobileNav", () => ({
  MobileNav: () => <div data-testid="mobile-nav" />,
}));
jest.mock("@/components/Logo", () => ({
  Logo: () => <div data-testid="logo" />,
}));
jest.mock("@/components/BoardControls", () => ({
  BoardControls: () => <div data-testid="board-controls" />,
}));

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as any).__lastBoardProps = undefined;
});

describe("ExplorerClient", () => {
  it("refreshes the RSC payload on mount so newly-saved lines aren't cached behind the router", () => {
    render(<ExplorerClient repertoires={[]} />);
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it("passes hideHistoryOverlay to Board so the curtain doesn't cover a loaded game", () => {
    render(<ExplorerClient repertoires={[]} />);
    expect(screen.getByTestId("explorer-board")).toBeInTheDocument();
    expect(
      (globalThis as any).__lastBoardProps?.hideHistoryOverlay,
    ).toBe(true);
  });
});
