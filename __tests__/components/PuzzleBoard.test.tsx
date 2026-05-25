/**
 * PuzzleBoard tests.
 *
 * The component is a forwardRef wrapper around the read-only Chessboard
 * with a small state machine for revealing the solution. We mock the
 * board renderer and assert the FEN it receives at each step driven by
 * the imperative handle.
 */
import React, { useRef } from "react";
import { act, render, screen } from "@testing-library/react";
import { PuzzleBoard, type PuzzleBoardHandle } from "@/components/PuzzleBoard";
import { SettingsProvider } from "@/contexts/SettingsContext";

jest.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: any }) => (
    <div
      data-testid="chessboard"
      data-position={options?.position ?? ""}
      data-orientation={options?.boardOrientation ?? ""}
    />
  ),
}));

function renderWithProviders(ui: React.ReactElement) {
  return render(<SettingsProvider>{ui}</SettingsProvider>);
}

// Real chess.js — easier than mocking and lets us assert real FENs.
// Classic Italian opening start, then a contrived 2-move solution.
const FEN_START =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("PuzzleBoard", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });
  afterAll(() => {
    jest.useRealTimers();
  });

  it("renders the puzzle position (after applying the setup move)", () => {
    renderWithProviders(
      <PuzzleBoard
        initialFen={FEN_START}
        moves={["e2e4", "e7e5"]} // setup = e2e4; solution = e7e5
        revealSolution={false}
        orientation="black"
      />,
    );
    const board = screen.getByTestId("chessboard");
    // After 1. e4 the position has black to move.
    expect(board.getAttribute("data-position")).toContain(" b ");
    expect(board.getAttribute("data-orientation")).toBe("black");
  });

  it("advances through the solution when revealSolution flips on", () => {
    const { rerender } = renderWithProviders(
      <PuzzleBoard
        initialFen={FEN_START}
        moves={["e2e4", "e7e5", "g1f3"]} // setup + 2 solution plies
        revealSolution={false}
        orientation="black"
      />,
    );

    const startFen = screen
      .getByTestId("chessboard")
      .getAttribute("data-position");

    rerender(
      <SettingsProvider>
        <PuzzleBoard
          initialFen={FEN_START}
          moves={["e2e4", "e7e5", "g1f3"]}
          revealSolution={true}
          orientation="black"
        />
      </SettingsProvider>,
    );

    // Each timer tick moves one ply forward (600ms apart in the source).
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(
      screen.getByTestId("chessboard").getAttribute("data-position"),
    ).not.toBe(startFen);

    act(() => {
      jest.advanceTimersByTime(700);
    });
    const finalFen = screen
      .getByTestId("chessboard")
      .getAttribute("data-position");
    // After 2 solution plies (e5 then Nf3), it's black's turn again.
    expect(finalFen).toContain(" b ");
  });

  it("exposes goTo* handles that move the position", () => {
    const Wrapper = () => {
      const ref = useRef<PuzzleBoardHandle | null>(null);
      return (
        <>
          <button
            data-testid="next"
            onClick={() => ref.current?.goToNext()}
          />
          <button
            data-testid="prev"
            onClick={() => ref.current?.goToPrevious()}
          />
          <button
            data-testid="last"
            onClick={() => ref.current?.goToLast()}
          />
          <button
            data-testid="first"
            onClick={() => ref.current?.goToFirst()}
          />
          <PuzzleBoard
            ref={ref}
            initialFen={FEN_START}
            moves={["e2e4", "e7e5", "g1f3"]}
            revealSolution={false}
            orientation="black"
          />
        </>
      );
    };

    renderWithProviders(<Wrapper />);
    const board = () =>
      screen.getByTestId("chessboard").getAttribute("data-position");

    const initial = board();

    // goToLast jumps to final solution position
    act(() => {
      screen.getByTestId("last").click();
    });
    expect(board()).not.toBe(initial);
    expect(board()).toContain(" b "); // after 2 solution plies, black to move

    // goToFirst returns to puzzle position
    act(() => {
      screen.getByTestId("first").click();
    });
    expect(board()).toBe(initial);
  });
});
