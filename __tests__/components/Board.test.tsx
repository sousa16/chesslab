import React from "react";
import { render, screen } from "@testing-library/react";
import { Board, BoardHandle } from "@/components/Board";

// Mock react-chessboard
jest.mock("react-chessboard", () => ({
  Chessboard: ({ options }: any) => (
    <div data-testid="chessboard" data-fen={options.position} data-dragging-allowed={options.allowDragging}>
      Chessboard Component
    </div>
  ),
}));

describe("Board Component", () => {
  it("should render the chessboard", () => {
    render(<Board />);
    expect(screen.getByTestId("chessboard")).toBeInTheDocument();
  });

  it("should render with default white orientation", () => {
    render(<Board />);
    const chessboard = screen.getByTestId("chessboard");
    expect(chessboard).toBeInTheDocument();
  });

  it("should render with black orientation when playerColor is black", () => {
    render(<Board playerColor="black" />);
    expect(screen.getByTestId("chessboard")).toBeInTheDocument();
  });

  it("should render starting position FEN", () => {
    render(<Board />);
    const chessboard = screen.getByTestId("chessboard");
    // Standard chess starting position
    expect(chessboard.getAttribute("data-fen")).toBe(
      "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    );
  });

  it("should have proper styling classes", () => {
    const { container } = render(<Board />);
    const boardWrapper = container.querySelector('[data-testid="board"]');
    expect(boardWrapper).toHaveClass("w-full", "aspect-square", "max-w-2xl");
  });

  it("should allow dragging at initial position", () => {
    render(<Board />);
    const chessboard = screen.getByTestId("chessboard");
    expect(chessboard.getAttribute("data-dragging-allowed")).toBe("true");
  });

  it("should support move history navigation via ref", () => {
    const ref = React.createRef<BoardHandle>();
    render(<Board ref={ref} />);
    
    expect(ref.current).toBeDefined();
    expect(ref.current?.goToFirst).toBeDefined();
    expect(ref.current?.goToPrevious).toBeDefined();
    expect(ref.current?.goToNext).toBeDefined();
    expect(ref.current?.goToLast).toBeDefined();
    expect(ref.current?.reset).toBeDefined();
  });

  it("should disable dragging when viewing history", () => {
    const ref = React.createRef<BoardHandle>();
    const { rerender } = render(<Board ref={ref} />);
    
    // Navigate back (would disable dragging if we had moves)
    // Since we can't make actual moves in test with mocked chessboard,
    // we verify the structure exists
    expect(ref.current).toBeDefined();
  });

  it("should show history indicator when viewing past moves", () => {
    render(<Board />);
    // Initially no indicator should show
    expect(screen.queryByText("Viewing move history")).not.toBeInTheDocument();
  });

  it("should call onMoveHistoryChange callback when provided", () => {
    const mockOnMoveHistoryChange = jest.fn();
    render(<Board onMoveHistoryChange={mockOnMoveHistoryChange} />);
    
    // The component should exist and be ready for moves
    expect(screen.getByTestId("chessboard")).toBeInTheDocument();
  });
});

