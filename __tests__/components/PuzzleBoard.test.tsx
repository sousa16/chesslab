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

// Stash the latest options on a global so analysis-mode tests can invoke
// onPieceDrop directly. The mock factory is hoisted by Jest and can't close
// over outer `let`s, so globalThis is the cleanest channel.
jest.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: any }) => {
    (globalThis as any).__lastChessboardOptions = options;
    return (
      <div
        data-testid="chessboard"
        data-position={options?.position ?? ""}
        data-orientation={options?.boardOrientation ?? ""}
        data-dragging={String(Boolean(options?.allowDragging))}
      />
    );
  },
}));

function lastBoardOptions() {
  return (globalThis as any).__lastChessboardOptions as {
    position: string;
    allowDragging: boolean;
    onPieceDrop?: (args: {
      sourceSquare: string;
      targetSquare: string | null;
    }) => boolean;
  };
}

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

  describe("analysis mode", () => {
    // Setup move = e2e4, then a 2-ply "solution" (e7e5, g1f3). Tests
    // assert the board state at each base / branch position.
    const MOVES = ["e2e4", "e7e5", "g1f3"];

    function Harness({ onPositionChange }: { onPositionChange?: jest.Mock }) {
      const ref = useRef<PuzzleBoardHandle | null>(null);
      const [analysis, setAnalysis] = React.useState(false);
      return (
        <>
          <button
            data-testid="toggle"
            onClick={() => setAnalysis((a) => !a)}
          />
          <button
            data-testid="next"
            onClick={() => ref.current?.goToNext()}
          />
          <button
            data-testid="prev"
            onClick={() => ref.current?.goToPrevious()}
          />
          <button
            data-testid="first"
            onClick={() => ref.current?.goToFirst()}
          />
          <button
            data-testid="last"
            onClick={() => ref.current?.goToLast()}
          />
          <PuzzleBoard
            ref={ref}
            initialFen={FEN_START}
            moves={MOVES}
            revealSolution={true}
            orientation="black"
            analysisMode={analysis}
            onPositionChange={onPositionChange}
          />
        </>
      );
    }

    function position() {
      return screen.getByTestId("chessboard").getAttribute("data-position");
    }

    function dragging() {
      return (
        screen.getByTestId("chessboard").getAttribute("data-dragging") ===
        "true"
      );
    }

    it("disables dragging by default and enables it only in analysis mode", () => {
      renderWithProviders(<Harness />);
      expect(dragging()).toBe(false);
      act(() => {
        screen.getByTestId("toggle").click();
      });
      expect(dragging()).toBe(true);
    });

    it("preserves the displayed position when toggled on, then lets arrows walk the full solution backwards", () => {
      renderWithProviders(<Harness />);
      // Play the solution out so we land on the last move.
      act(() => {
        jest.advanceTimersByTime(MOVES.length * 700);
      });
      const lastFen = position();
      expect(lastFen).toContain(" b "); // after e4 e5 Nf3, black to move

      // Toggle analysis on — should NOT move the board.
      act(() => {
        screen.getByTestId("toggle").click();
      });
      expect(position()).toBe(lastFen);

      // Stepping backward should walk the entire solution, not stop at
      // the anchor (this is the bug fix the user asked for).
      act(() => {
        screen.getByTestId("prev").click();
      });
      const afterFirstBack = position();
      expect(afterFirstBack).not.toBe(lastFen);

      act(() => {
        screen.getByTestId("prev").click();
      });
      expect(position()).not.toBe(afterFirstBack);

      act(() => {
        screen.getByTestId("first").click();
      });
      // goToFirst lands at the puzzle position (before any solution move,
      // i.e. after the setup move e2e4 → black to move with no pieces yet
      // captured).
      expect(position()).toContain(" b ");
      // Sanity: this is the position BEFORE black plays e7e5, distinct
      // from the post-e7e5 position we passed through.
      expect(position()).not.toBe(afterFirstBack);
    });

    it("creates a branch when the user drags from a base position and re-engages base nav when stepping back past the root", () => {
      renderWithProviders(<Harness />);
      act(() => {
        jest.advanceTimersByTime(MOVES.length * 700);
      });
      // Walk back to the puzzle position so the next legal move is for black.
      act(() => {
        screen.getByTestId("toggle").click();
      });
      act(() => {
        screen.getByTestId("first").click();
      });
      const baseFen = position();

      // Drag black's c7-c5 → board updates to a NEW position (branch).
      act(() => {
        lastBoardOptions().onPieceDrop?.({
          sourceSquare: "c7",
          targetSquare: "c5",
        });
      });
      const branchFen = position();
      expect(branchFen).not.toBe(baseFen);
      expect(branchFen).toContain(" w "); // it's now white to move

      // Stepping back from inside a 1-move branch lands us at the base
      // (branch is kept so forward navigation re-enters it).
      act(() => {
        screen.getByTestId("prev").click();
      });
      expect(position()).toBe(baseFen);

      // Stepping back AGAIN from the base discards the branch and walks
      // the base line further back. From baseIndex=-1 it stays put.
      act(() => {
        screen.getByTestId("prev").click();
      });
      expect(position()).toBe(baseFen);
    });

    it("rejects illegal drops without losing the current position", () => {
      renderWithProviders(<Harness />);
      act(() => {
        screen.getByTestId("toggle").click();
      });
      const before = position();
      let result: boolean | undefined;
      act(() => {
        result = lastBoardOptions().onPieceDrop?.({
          sourceSquare: "a1",
          targetSquare: "a8", // illegal — own piece blocked / can't jump
        });
      });
      expect(result).toBe(false);
      expect(position()).toBe(before);
    });

    it("fires onPositionChange whenever the displayed FEN changes in analysis mode", () => {
      const cb = jest.fn();
      renderWithProviders(<Harness onPositionChange={cb} />);
      act(() => {
        jest.advanceTimersByTime(MOVES.length * 700);
      });
      act(() => {
        screen.getByTestId("toggle").click();
      });
      cb.mockClear();
      // Walking back through the base line changes the displayed FEN, so
      // each step must emit the new position to the engine effect.
      act(() => {
        screen.getByTestId("prev").click();
      });
      expect(cb).toHaveBeenCalled();
      const fenSeen = cb.mock.calls[cb.mock.calls.length - 1][0] as string;
      expect(fenSeen).toBe(position());
    });
  });
});
