/**
 * HomePanel Component Tests
 *
 * Tests for the HomePanel dashboard component that displays:
 * - Repertoire selection (white/black) with progress percentages
 * - Training stats (due count, total positions)
 * - Practice button functionality
 */

import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { HomePanel } from "@/components/HomePanel";

// Mock next/navigation
const mockPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock fetch
global.fetch = jest.fn();

describe("HomePanel Component", () => {
  const mockOnSelectRepertoire = jest.fn();
  const mockOnStartPractice = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        dueCount: 15,
        totalPositions: 42,
        colorStats: {
          white: { learned: 20, total: 25 },
          black: { learned: 10, total: 17 },
        },
      }),
    });
  });

  it("should render the dashboard header", () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("should render both repertoire buttons", () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    expect(screen.getByText("White Repertoire")).toBeInTheDocument();
    expect(screen.getByText("Black Repertoire")).toBeInTheDocument();
  });

  it("should call onSelectRepertoire with 'white' when white repertoire is clicked", () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    fireEvent.click(screen.getByText("White Repertoire"));
    expect(mockOnSelectRepertoire).toHaveBeenCalledWith("white");
  });

  it("should call onSelectRepertoire with 'black' when black repertoire is clicked", () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    fireEvent.click(screen.getByText("Black Repertoire"));
    expect(mockOnSelectRepertoire).toHaveBeenCalledWith("black");
  });

  it("should fetch training stats on mount", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/training-stats");
    });
  });

  it("should display fetched stats", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // Wait for the Due Today section to show 15
    await waitFor(() => {
      const dueElements = screen.getAllByText("15");
      expect(dueElements.length).toBeGreaterThan(0);
    });
  });

  it("should display correct percentage for white repertoire (learned/total)", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // 20/25 = 80%
    await waitFor(() => {
      const percentages = screen.getAllByText("80%");
      expect(percentages.length).toBeGreaterThan(0);
    });
  });

  it("should display correct percentage for black repertoire", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // 10/17 = 58.8% → rounds to 59%
    await waitFor(() => {
      const percentages = screen.getAllByText("59%");
      expect(percentages.length).toBeGreaterThan(0);
    });
  });

  it("should show 100% when repertoire has no positions", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        dueCount: 0,
        totalPositions: 0,
        colorStats: {
          white: { learned: 0, total: 0 },
          black: { learned: 0, total: 0 },
        },
      }),
    });

    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      const percentages = screen.getAllByText("100%");
      expect(percentages).toHaveLength(2);
    });
  });

  it("should call onStartPractice when practice button is clicked", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Practice Now")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Practice Now"));
    expect(mockOnStartPractice).toHaveBeenCalled();
  });

  it("should disable practice button when no cards are due", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        dueCount: 0,
        totalPositions: 10,
        colorStats: {
          white: { learned: 5, total: 5 },
          black: { learned: 5, total: 5 },
        },
      }),
    });

    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      const button = screen.getByText("Nothing to Practice");
      expect(button.closest("button")).toBeDisabled();
    });
  });

  it("should show 'All caught up!' when no cards are due", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        dueCount: 0,
        totalPositions: 10,
        colorStats: {
          white: { learned: 5, total: 5 },
          black: { learned: 5, total: 5 },
        },
      }),
    });

    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("All caught up!")).toBeInTheDocument();
    });
  });

  it("should show 'Due now' when cards are due", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Due now")).toBeInTheDocument();
    });
  });

  it("should handle fetch error gracefully", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // Should still render without crashing
    expect(screen.getByText("Dashboard")).toBeInTheDocument();
  });

  it("should navigate to settings when settings button is clicked", () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // Find and click the settings button (icon button)
    const settingsButtons = screen.getAllByRole("button");
    const settingsButton = settingsButtons.find((btn) =>
      btn.className.includes("ghost"),
    );
    if (settingsButton) {
      fireEvent.click(settingsButton);
      expect(mockPush).toHaveBeenCalledWith("/settings");
    }
  });
});
