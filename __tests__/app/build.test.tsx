import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import BuildPage from "@/app/(app)/build/[color]/page";
import { useRouter, useSearchParams, useParams } from "next/navigation";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  useParams: jest.fn(),
  usePathname: jest.fn(() => "/build/white"),
}));

// Mock Board component
const mockBoardReset = jest.fn();
jest.mock("@/components/Board", () => ({
  Board: React.forwardRef(
    (
      { playerColor, buildMode, onMovesUpdated, initialMoves }: any,
      ref: any,
    ) => {
      React.useImperativeHandle(ref, () => ({
        reset: mockBoardReset,
        goToFirst: jest.fn(),
        goToPrevious: jest.fn(),
        goToNext: jest.fn(),
        goToLast: jest.fn(),
        getMoveHistory: jest.fn(() => []),
        deleteToMove: jest.fn(),
      }));

      // Simulate making a move by calling onMovesUpdated
      const handleClick = () => {
        onMovesUpdated?.([
          {
            number: 1,
            white: "e4",
            whiteUci: "e2e4",
          },
        ]);
      };

      return (
        <div data-testid="chessboard" onClick={handleClick}>
          Board Component
        </div>
      );
    },
  ),
  BoardHandle: {},
}));

// Mock BuildPanel component
jest.mock("@/components/BuildPanel", () => ({
  BuildPanel: ({ color, onBack }: any) => (
    <div data-testid="build-panel">
      <button onClick={onBack}>Back</button>
    </div>
  ),
}));

jest.mock("@/components/Logo", () => ({
  Logo: () => <div>Logo</div>,
}));

jest.mock("@/lib/repertoire", () => ({
  convertSanToUci: jest.fn((moves) => moves.map((m) => m.toLowerCase())),
}));

// Mock toast hook
const mockToast = jest.fn();
const mockSuccess = jest.fn();
const mockError = jest.fn();
jest.mock("@/components/ui/toast", () => ({
  useToast: () => ({ 
    toast: mockToast,
    success: mockSuccess,
    error: mockError,
    warning: jest.fn(),
    info: jest.fn(),
  }),
}));

const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;
const mockUseParams = useParams as jest.MockedFunction<typeof useParams>;

describe("Build Page", () => {
  const mockPush = jest.fn();
  const mockBack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockBoardReset.mockClear();
    mockToast.mockClear();
    mockSuccess.mockClear();
    mockError.mockClear();

    mockUseRouter.mockReturnValue({
      push: mockPush,
      back: mockBack,
      replace: jest.fn(),
      prefetch: jest.fn(),
    } as any);

    mockUseSearchParams.mockReturnValue({
      get: jest.fn(() => null),
    } as any);

    mockUseParams.mockReturnValue({
      color: "white",
    } as any);
  });

  it("should render build page for white", () => {
    render(<BuildPage params={{ color: "white" }} />);

    expect(screen.getByTestId("chessboard")).toBeInTheDocument();
    expect(screen.getByTestId("build-panel")).toBeInTheDocument();
  });

  it("should render build page for black", () => {
    mockUseParams.mockReturnValue({
      color: "black",
    } as any);

    render(<BuildPage params={{ color: "black" }} />);

    expect(screen.getByTestId("chessboard")).toBeInTheDocument();
    expect(screen.getByTestId("build-panel")).toBeInTheDocument();
  });

  it("should display position indicator after first move", () => {
    render(<BuildPage params={{ color: "white" }} />);

    // Make a move
    fireEvent.click(screen.getByTestId("chessboard"));

    // Position indicator should appear
    expect(screen.getByText(/Position after/)).toBeInTheDocument();
    expect(screen.getByText("1. e4")).toBeInTheDocument();
  });
});
