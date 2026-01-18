import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import BuildPage from "@/app/(app)/build/[color]/page";
import { useRouter, useSearchParams, useParams } from "next/navigation";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
  useParams: jest.fn(),
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

  it("should display turn label initially for white player", () => {
    render(<BuildPage params={{ color: "white" }} />);

    expect(
      screen.getByText("White's turn. Click a square to add move."),
    ).toBeInTheDocument();
  });

  it("should display turn label initially for black player", () => {
    mockUseParams.mockReturnValue({
      color: "black",
    } as any);

    render(<BuildPage params={{ color: "black" }} />);

    expect(
      screen.getByText("White's turn. Click a square to add move."),
    ).toBeInTheDocument();
  });

  it("should update turn label after white makes a move", () => {
    render(<BuildPage params={{ color: "white" }} />);

    // Initially white's turn
    expect(
      screen.getByText("White's turn. Click a square to add move."),
    ).toBeInTheDocument();

    // Make a move (white makes e4)
    fireEvent.click(screen.getByTestId("chessboard"));

    // After white's move, it should be black's turn
    expect(
      screen.getByText("Black's turn. Click a square to add response."),
    ).toBeInTheDocument();
  });

  it("should update turn label after black makes a move", () => {
    mockUseParams.mockReturnValue({
      color: "black",
    } as any);

    render(<BuildPage params={{ color: "black" }} />);

    // Initially white's turn (white goes first)
    expect(
      screen.getByText("White's turn. Click a square to add move."),
    ).toBeInTheDocument();

    // Make a move (white makes e4)
    fireEvent.click(screen.getByTestId("chessboard"));

    // After white's move, it should be black's turn
    expect(
      screen.getByText("Black's turn. Click a square to add response."),
    ).toBeInTheDocument();
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
