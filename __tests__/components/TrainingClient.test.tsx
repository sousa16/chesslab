/**
 * TrainingClient Component Tests
 *
 * Tests for the TrainingClient component that handles:
 * - Review mode (updates SRS via API)
 * - Practice mode (no SRS updates)
 * - Board display and move handling
 * - Progress tracking
 * - Session completion
 */

import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import TrainingClient from "@/components/TrainingClient";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock react-chessboard
jest.mock("react-chessboard", () => ({
  Chessboard: ({ options }: { options: any }) => (
    <div data-testid="chessboard" data-position={options?.position || ""}>
      Mock Chessboard
    </div>
  ),
}));

// Mock chess.js
jest.mock("chess.js", () => {
  return {
    Chess: jest.fn().mockImplementation((fen) => ({
      fen: () =>
        fen || "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
      turn: () => "w",
      get: (square: string) => ({ color: "w", type: "p" }),
      move: jest.fn().mockReturnValue({ from: "e2", to: "e4", san: "e4" }),
      moves: jest.fn().mockReturnValue([{ from: "e2", to: "e4", san: "e4" }]),
    })),
  };
});

// Mock fetch
global.fetch = jest.fn();

describe("TrainingClient Component", () => {
  const mockUser = {
    id: "user-1",
    repertoires: [
      {
        id: "rep-1",
        color: "White",
        entries: [
          {
            id: "entry-1",
            expectedMove: "e2e4",
            interval: 1,
            easeFactor: 2.5,
            repetitions: 1,
            nextReviewDate: new Date(),
            phase: "exponential",
            learningStepIndex: 0,
            position: {
              id: "pos-1",
              fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
            },
          },
          {
            id: "entry-2",
            expectedMove: "g1f3",
            interval: 1,
            easeFactor: 2.5,
            repetitions: 1,
            nextReviewDate: new Date(),
            phase: "exponential",
            learningStepIndex: 0,
            position: {
              id: "pos-2",
              fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 1",
            },
          },
        ],
      },
    ],
  };

  const emptyUser = {
    id: "user-1",
    repertoires: [
      {
        id: "rep-1",
        color: "White",
        entries: [],
      },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
  });

  describe("Empty State", () => {
    it('should show "All caught up!" when no cards to review', () => {
      render(<TrainingClient user={emptyUser} />);

      expect(screen.getByText("All caught up!")).toBeInTheDocument();
    });

    it("should show back button in empty state", () => {
      render(<TrainingClient user={emptyUser} />);

      expect(screen.getByText("Back to Home")).toBeInTheDocument();
    });
  });

  describe("Review Mode (default)", () => {
    it("should display Training header in review mode", () => {
      render(<TrainingClient user={mockUser} />);

      expect(screen.getByText("Training")).toBeInTheDocument();
    });

    it("should display progress counter", () => {
      render(<TrainingClient user={mockUser} />);

      expect(screen.getByText("1 / 2")).toBeInTheDocument();
    });

    it("should show Show Answer button initially", () => {
      render(<TrainingClient user={mockUser} />);

      expect(screen.getByText("Show Answer")).toBeInTheDocument();
    });

    it("should show feedback buttons after clicking Show Answer", () => {
      render(<TrainingClient user={mockUser} />);

      fireEvent.click(screen.getByText("Show Answer"));

      expect(screen.getByText("Forgot")).toBeInTheDocument();
      expect(screen.getByText("Hard")).toBeInTheDocument();
      expect(screen.getByText("Good")).toBeInTheDocument();
      expect(screen.getByText("Easy")).toBeInTheDocument();
    });

    it("should call API when feedback is given in review mode", async () => {
      render(<TrainingClient user={mockUser} mode="review" />);

      fireEvent.click(screen.getByText("Show Answer"));
      fireEvent.click(screen.getByText("Good"));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          "/api/repertoire-entries/review",
          expect.objectContaining({
            method: "POST",
            body: expect.stringContaining("entry-1"),
          }),
        );
      });
    });

    it("should display streak counter", () => {
      render(<TrainingClient user={mockUser} />);

      expect(screen.getByText("streak")).toBeInTheDocument();
      expect(screen.getByText("0")).toBeInTheDocument();
    });
  });

  describe("Practice Mode", () => {
    it("should display Practice header in practice mode", () => {
      render(<TrainingClient user={mockUser} mode="practice" />);

      expect(screen.getByText("Practice")).toBeInTheDocument();
    });

    it("should NOT call API when feedback is given in practice mode", async () => {
      render(<TrainingClient user={mockUser} mode="practice" />);

      fireEvent.click(screen.getByText("Show Answer"));
      fireEvent.click(screen.getByText("Good"));

      // Wait a bit to ensure no API call is made
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("should still progress to next card in practice mode", async () => {
      render(<TrainingClient user={mockUser} mode="practice" />);

      // Initially showing card 1
      expect(screen.getByText("1 / 2")).toBeInTheDocument();

      fireEvent.click(screen.getByText("Show Answer"));
      fireEvent.click(screen.getByText("Good"));

      // Should progress to card 2
      await waitFor(() => {
        expect(screen.getByText("2 / 2")).toBeInTheDocument();
      });
    });
  });

  describe("Navigation", () => {
    it("should navigate back to home when back button is clicked", () => {
      render(<TrainingClient user={mockUser} />);

      // Find the back button (ChevronLeft icon button)
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[0]); // First button is back

      expect(mockPush).toHaveBeenCalledWith("/home");
    });
  });

  describe("Session Completion", () => {
    it("should show completion screen after all cards are reviewed", async () => {
      const singleCardUser = {
        id: "user-1",
        repertoires: [
          {
            id: "rep-1",
            color: "White",
            entries: [mockUser.repertoires[0].entries[0]],
          },
        ],
      };

      render(<TrainingClient user={singleCardUser} mode="practice" />);

      fireEvent.click(screen.getByText("Show Answer"));
      fireEvent.click(screen.getByText("Good"));

      await waitFor(() => {
        expect(screen.getByText("Session Complete!")).toBeInTheDocument();
      });
    });
  });

  describe("Color Display", () => {
    it("should show repertoire color", () => {
      render(<TrainingClient user={mockUser} />);

      // The component displays lowercase "white" in multiple places
      const whiteElements = screen.getAllByText(/white/i);
      expect(whiteElements.length).toBeGreaterThan(0);
    });

    it("should show Both Colors when training multiple repertoires", () => {
      const multiColorUser = {
        id: "user-1",
        repertoires: [
          {
            id: "rep-1",
            color: "White",
            entries: [mockUser.repertoires[0].entries[0]],
          },
          {
            id: "rep-2",
            color: "Black",
            entries: [
              {
                ...mockUser.repertoires[0].entries[0],
                id: "entry-b1",
              },
            ],
          },
        ],
      };

      render(<TrainingClient user={multiColorUser} />);

      expect(screen.getByText("Both Colors")).toBeInTheDocument();
    });
  });

  describe("Chessboard", () => {
    it("should render chessboard component", () => {
      render(<TrainingClient user={mockUser} />);

      expect(screen.getByTestId("chessboard")).toBeInTheDocument();
    });

    it("should display the correct position", () => {
      render(<TrainingClient user={mockUser} />);

      const board = screen.getByTestId("chessboard");
      expect(board.getAttribute("data-position")).toContain(
        "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR",
      );
    });
  });
});
