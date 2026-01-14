import React from "react";
import { render, screen } from "@testing-library/react";
import { Board } from "@/components/Board";

// Mock react-chessboard
jest.mock("react-chessboard", () => ({
  Chessboard: ({ options }: any) => (
    <div data-testid="chessboard" data-fen={options.position}>
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
    const boardWrapper = container.firstChild;
    expect(boardWrapper).toHaveClass("w-full", "aspect-square", "max-w-2xl");
  });
});
