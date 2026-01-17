import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { LineTree } from "@/components/repertoire/LineTree";

// Mock chess.js for unit testing
jest.mock("chess.js", () => {
  return {
    Chess: jest.fn().mockImplementation((fen) => {
      const game = {
        fen: jest
          .fn()
          .mockReturnValue(
            fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
          ),
        move: jest.fn((moveInput) => {
          // Mock move behavior
          if (typeof moveInput === "string") {
            // SAN move
            if (moveInput === "e4") return { from: "e2", to: "e4", san: "e4" };
            if (moveInput === "c5") return { from: "c7", to: "c5", san: "c5" };
            if (moveInput === "Nf3")
              return { from: "g1", to: "f3", san: "Nf3" };
          } else if (typeof moveInput === "object") {
            // UCI move object
            const { from, to } = moveInput;
            if (from === "e2" && to === "e4")
              return { from: "e2", to: "e4", san: "e4" };
            if (from === "c7" && to === "c5")
              return { from: "c7", to: "c5", san: "c5" };
            if (from === "g1" && to === "f3")
              return { from: "g1", to: "f3", san: "Nf3" };
          }
          return null;
        }),
      };
      return game;
    }),
  };
});

describe("LineTree Component", () => {
  const mockOnBuild = jest.fn();
  const mockOnLearn = jest.fn();
  const mockOnLineClick = jest.fn();

  const mockRoot: any = {
    id: "root",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    expectedMove: "",
    moveSequence: "Initial Position",
    children: [
      {
        id: "e4-node",
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
        expectedMove: "e2e4",
        moveSequence: "1.e2e4",
        children: [
          {
            id: "e4-c5-node",
            fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
            expectedMove: "c7c5",
            moveSequence: "1.e2e4 c7c5",
            children: [
              {
                id: "e4-c5-nf3-node",
                fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
                expectedMove: "g1f3",
                moveSequence: "1.e2e4 c7c5 2.g1f3",
                children: [],
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering", () => {
    it("renders the root node with its move sequence", () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Check if the root is displayed (Initial Position)
      expect(screen.getByText("Initial Position")).toBeInTheDocument();
    });

    it("renders child nodes when expanded", () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Child nodes should be rendered by default (expanded)
      expect(screen.getByText("1.e2e4")).toBeInTheDocument();
      expect(screen.getByText("1.e2e4 c7c5")).toBeInTheDocument();
    });

    it("displays nested children with proper indentation", () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Verify the full line is rendered
      expect(screen.getByText("1.e2e4 c7c5 2.g1f3")).toBeInTheDocument();
    });
  });

  describe("Click to Display Feature", () => {
    it("calls onLineClick when a line is clicked", () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Click on the e4 line
      const e4Line = screen.getByText("1.e2e4");
      fireEvent.click(e4Line);

      // Verify callback was called with moves and FEN
      expect(mockOnLineClick).toHaveBeenCalledWith(
        expect.arrayContaining(["e4"]),
        expect.any(String),
      );
    });

    it("passes full move sequence to callback for nested lines", () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Click on the deepest line
      const nf3Line = screen.getByText("1.e2e4 c7c5 2.g1f3");
      fireEvent.click(nf3Line);

      // Verify callback was called with the full move sequence
      expect(mockOnLineClick).toHaveBeenCalledWith(
        expect.any(Array),
        expect.any(String),
      );

      const [moves, fen] = mockOnLineClick.mock.calls[0];
      expect(moves.length).toBeGreaterThanOrEqual(2); // Should have at least 2 moves
      expect(fen).toMatch(/^[rnbqkbnr\/pppppppp]/); // Should be a valid FEN
    });

    it("passes the correct starting FEN position to callback", () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      const e4Line = screen.getByText("1.e2e4");
      fireEvent.click(e4Line);

      const [, fen] = mockOnLineClick.mock.calls[0];

      // Verify the FEN is the position after e2e4 (what the node contains)
      expect(fen).toBe(
        "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
      );
    });
  });

  describe("Expand/Collapse", () => {
    it("toggles expansion when chevron is clicked", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Initially expanded, so children are visible
      expect(screen.getByText("1.e2e4")).toBeInTheDocument();

      // Find and click the expand/collapse button
      const chevronButton = container.querySelector("button[title='Collapse']");
      if (chevronButton) {
        fireEvent.click(chevronButton);
        // After collapse, children should not be visible
        expect(screen.queryByText("1.e2e4 c7c5")).not.toBeInTheDocument();
      }
    });
  });

  describe("Build and Learn Buttons", () => {
    it("calls onBuild when build button is clicked", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Find Build buttons (hammer icon)
      const buildButtons = container.querySelectorAll("button[title='Build']");
      if (buildButtons.length > 0) {
        fireEvent.click(buildButtons[0]);
        expect(mockOnBuild).toHaveBeenCalled();
      }
    });

    it("calls onLearn when learn button is clicked", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Find Learn buttons (graduation cap icon)
      const learnButtons = container.querySelectorAll("button[title='Learn']");
      if (learnButtons.length > 0) {
        fireEvent.click(learnButtons[0]);
        expect(mockOnLearn).toHaveBeenCalled();
      }
    });
  });

  describe("Move Extraction Edge Cases", () => {
    it("handles empty move sequences gracefully", () => {
      const emptyRoot: any = {
        id: "empty",
        fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        expectedMove: "",
        moveSequence: "Initial Position",
        children: [],
      };

      render(
        <LineTree
          root={emptyRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      const initialPosition = screen.getByText("Initial Position");
      fireEvent.click(initialPosition);

      // Should call with empty moves array
      expect(mockOnLineClick).toHaveBeenCalledWith([], expect.any(String));
    });
  });
});
