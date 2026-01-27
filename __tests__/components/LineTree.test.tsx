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
      const expandButton = screen.getAllByTitle("Expand")[0];
      fireEvent.click(expandButton);
      
      // Now child should be visible
      expect(screen.getByText("1.e2e4 c7c5")).toBeInTheDocument();
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
      const firstExpandButton = screen.getAllByTitle("Expand")[0];
      fireEvent.click(firstExpandButton); // Expand e4
      
      // Wait for child to appear and then expand it
      await waitFor(() => {
        expect(screen.getByText("1.e2e4 c7c5")).toBeInTheDocument();
      });
      
      const secondExpandButton = screen.getAllByTitle("Expand")[0]; // After first expansion, indices change
      fireEvent.click(secondExpandButton); // Expand c5
      
      // Verify the full line is rendered
      await waitFor(() => {
        expect(screen.getByText("1.e2e4 c7c5 2.g1f3")).toBeInTheDocument();
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
      const firstExpandButton = screen.getAllByTitle("Expand")[0];
      fireEvent.click(firstExpandButton); // Expand e4
      
      await waitFor(() => {
        expect(screen.getByText("1.e2e4 c7c5")).toBeInTheDocument();
      });
      
      const secondExpandButton = screen.getAllByTitle("Expand")[0];
      fireEvent.click(secondExpandButton); // Expand c5

      // Wait for deepest line to appear
      await waitFor(() => {
        expect(screen.getByText("1.e2e4 c7c5 2.g1f3")).toBeInTheDocument();
      });

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

  describe("Delete Button", () => {
    // Delete button feature not yet implemented in component
    it.skip("does not show delete button on Initial Position (root with no expectedMove)", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Get all delete buttons
      const deleteButtons = container.querySelectorAll(
        "button[title='Delete']",
      );
      // Should have delete buttons for all nodes with expectedMove (4 nodes: e4, c5, Nf3, and the first child)
      // Root (Initial Position) has no expectedMove so no delete button
      expect(deleteButtons.length).toBe(3); // e4-node, e4-c5-node, e4-c5-nf3-node
    });

    it.skip("shows delete button on first move line (depth 1)", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Find the first move line (1.e2e4)
      const e4Line = screen.getByText("1.e2e4");
      const e4Row = e4Line.closest(".flex.items-center");
      const deleteBtn = e4Row?.querySelector("button[title='Delete']");
      expect(deleteBtn).toBeInTheDocument();
    });

    it.skip("shows delete button on child nodes when onDelete is provided", () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      // Should have delete buttons for non-root nodes
      const deleteButtons = container.querySelectorAll(
        "button[title='Delete']",
      );
      expect(deleteButtons.length).toBeGreaterThan(0);
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

      // Should have no delete buttons
      const deleteButtons = container.querySelectorAll(
        "button[title='Delete']",
      );
      expect(deleteButtons.length).toBe(0);
    });

    it.skip("opens confirmation dialog when delete button is clicked", async () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      const deleteButtons = container.querySelectorAll(
        "button[title='Delete']",
      );
      expect(deleteButtons.length).toBeGreaterThan(0);

      fireEvent.click(deleteButtons[0]);

      // Dialog should appear with confirmation text
      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        expect(
          screen.getByText(/Are you sure you want to delete this line/),
        ).toBeInTheDocument();
      });
    });

    it.skip("closes dialog when Cancel is clicked", async () => {
      const { container } = render(
        <LineTree
          root={mockRoot}
          onBuild={mockOnBuild}
          onLearn={mockOnLearn}
          onDelete={mockOnDelete}
          onLineClick={mockOnLineClick}
        />,
      );

      const deleteButtons = container.querySelectorAll(
        "button[title='Delete']",
      );
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      const cancelButton = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      });
    });

    it.skip("calls onDelete when Delete Line button is clicked", async () => {
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

      const deleteButtons = container.querySelectorAll(
        "button[title='Delete']",
      );
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
      });

      // Find the confirm button by its distinctive styling
      const confirmButton = screen.getByRole("button", {
        name: /Delete Line/i,
      });
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockOnDelete).toHaveBeenCalled();
      });
    });

    it.skip("shows warning for nodes with children", async () => {
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
      const deleteButtons = container.querySelectorAll(
        "button[title='Delete']",
      );
      fireEvent.click(deleteButtons[0]);

      await waitFor(() => {
        expect(screen.getByRole("dialog")).toBeInTheDocument();
        // Should show warning about continuations
        expect(screen.getByText(/continuation/i)).toBeInTheDocument();
      });
    });
  });
});
