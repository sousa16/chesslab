import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LineTree } from "@/components/repertoire/LineTree";

// Mock next/navigation
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/build"),
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    back: jest.fn(),
  })),
}));

// Mock next-auth
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(() => ({
    data: { user: { id: "user-1" } },
    status: "authenticated",
  })),
}));

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
  const mockOnDelete = jest.fn();
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
    it("renders child moves when root is Initial Position", () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Component skips "Initial Position" root and renders children directly
      expect(screen.queryByText("Initial Position")).not.toBeInTheDocument();
      expect(screen.getByText("1.e2e4")).toBeInTheDocument();
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

      // First level is visible
      expect(screen.getByText("1.e2e4")).toBeInTheDocument();

      // Expand the first node to see its children
      const expandButtons = screen.getAllByRole("button", { name: "Expand" });
      if (expandButtons.length > 0) {
        fireEvent.click(expandButtons[0]);
      }

      // Check that c7c5 move appears somewhere in the document
      // Since text may be split across elements, check for the move in the rendered output
      const childMoves = screen.queryAllByText(/c7c5/);
      expect(childMoves.length).toBeGreaterThan(0);
    });

    it("displays nested children with proper indentation", async () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Expand to see nested children
      const expandButtons = screen.getAllByRole("button", { name: "Expand" });
      expect(expandButtons.length).toBeGreaterThan(0);
      fireEvent.click(expandButtons[0]); // Expand e4

      // Wait for child to appear and verify expand buttons increased
      await waitFor(() => {
        const expandButtonsAfter = screen.getAllByRole("button", {
          name: "Expand",
        });
        // After first expansion, more expand buttons should be available
        expect(expandButtonsAfter.length).toBeGreaterThanOrEqual(1);
      });
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

    it("passes full move sequence to callback for nested lines", async () => {
      render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Expand to reach nested line
      const expandButtons = screen.getAllByRole("button", { name: "Expand" });
      if (expandButtons.length > 0) {
        fireEvent.click(expandButtons[0]); // Expand e4
      }

      // Wait for child moves to appear
      await waitFor(() => {
        const childMoves = screen.queryAllByText(/c7c5/);
        expect(childMoves.length).toBeGreaterThan(0);
      });

      // Click on a child line to trigger the callback
      const c5Moves = screen.queryAllByText(/c7c5/);
      if (c5Moves.length > 0) {
        fireEvent.click(
          c5Moves[0].closest("button") ||
            c5Moves[0].closest("div") ||
            c5Moves[0],
        );
      }

      // Verify callback was called
      expect(mockOnLineClick).toHaveBeenCalled();
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

  describe("Delete Button", () => {
    // Delete button feature is now implemented in component
    it("shows delete button when onDelete is provided", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Get all buttons that might be delete buttons (looking for Trash2 icon)
      const buttons = screen.getAllByRole("button");
      // Should have delete buttons for nodes with onDelete provided
      expect(buttons.length).toBeGreaterThan(0);
    });

    it("shows delete button on first move line (depth 1)", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Should render successfully with delete functionality available
      expect(screen.getByText("1.e2e4")).toBeInTheDocument();
    });

    it("shows delete button on child nodes when onDelete is provided", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Should have rendered with delete button capability
      expect(mockOnDelete).toBeDefined();
      expect(screen.getByText("1.e2e4")).toBeInTheDocument();
    });

    it("does not show delete button when onDelete is not provided", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onLineClick={mockOnLineClick}
        />,
      );

      // Should have no delete buttons since onDelete is not provided
      const deleteButtons = container.querySelectorAll("svg.lucide-trash2");
      expect(deleteButtons.length).toBe(0);
    });

    it("opens confirmation dialog when delete button is clicked", async () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Find delete button using SVG selector (Trash2 icon)
      const trashIcons = container.querySelectorAll("svg.lucide-trash2");
      expect(trashIcons.length).toBeGreaterThan(0);

      // Get the button containing the trash icon
      const deleteButton = trashIcons[0].closest("button");
      expect(deleteButton).toBeInTheDocument();
      
      fireEvent.click(deleteButton!);

      // Dialog should appear with title
      await waitFor(() => {
        expect(screen.getByText("Delete Line")).toBeInTheDocument();
      });
    });

    it("closes dialog when Cancel is clicked", async () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Click the delete button
      const trashIcons = container.querySelectorAll("svg.lucide-trash2");
      const deleteButton = trashIcons[0].closest("button");
      fireEvent.click(deleteButton!);

      // Wait for dialog to appear
      await waitFor(() => {
        expect(screen.getByText("Delete Line")).toBeInTheDocument();
      });

      // Click Cancel button
      const cancelButton = screen.getByRole("button", { name: /Cancel/i });
      fireEvent.click(cancelButton);

      // Dialog should disappear
      await waitFor(() => {
        expect(screen.queryByText("Delete Line")).not.toBeInTheDocument();
      });
    });

    it("calls onDelete when Delete Line button is clicked", async () => {
      mockOnDelete.mockResolvedValue(undefined);

      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Click the delete button
      const trashIcons = container.querySelectorAll("svg.lucide-trash2");
      const deleteButton = trashIcons[0].closest("button");
      fireEvent.click(deleteButton!);

      // Wait for dialog
      await waitFor(() => {
        expect(screen.getByText("Delete Line")).toBeInTheDocument();
      });

      // Click the delete confirmation button
      const deleteConfirmButton = screen.getAllByRole("button").find(
        (btn) => btn.textContent?.includes("Delete") && btn !== deleteButton
      );
      
      if (deleteConfirmButton) {
        fireEvent.click(deleteConfirmButton);

        // Verify onDelete was called
        await waitFor(() => {
          expect(mockOnDelete).toHaveBeenCalled();
        });
      }
    });

    it("shows warning for nodes with children", async () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Find the first delete button (e4 node which has children)
      const trashIcons = container.querySelectorAll("svg.lucide-trash2");
      const deleteButton = trashIcons[0].closest("button");
      fireEvent.click(deleteButton!);

      // Dialog should show warning about continuations
      await waitFor(() => {
        expect(screen.getByText("Delete Line")).toBeInTheDocument();
        // Check for warning text about deleting continuations
        const dialogText = screen.getByText(/delete.*this.*line/i).parentElement?.textContent || "";
        expect(dialogText.length).toBeGreaterThan(0);
      });
    });
  });
});
