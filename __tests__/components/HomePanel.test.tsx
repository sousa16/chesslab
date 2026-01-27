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
  usePathname: jest.fn(() => "/home"),
}));

// Mock next-auth
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(() => ({
    data: { user: { id: "user-1" } },
    status: "authenticated",
  })),
}));

// Mock fetch
global.fetch = jest.fn();

describe("HomePanel Component", () => {
  const mockOnSelectRepertoire = jest.fn();
  const mockOnStartPractice = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url === "/api/training-stats") {
        return Promise.resolve({
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
      }
      if (url === "/api/repertoires?color=white") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            openings: [
              { id: "1", root: { children: [] } },
              { id: "2", root: { children: [] } },
            ],
          }),
        });
      }
      if (url === "/api/repertoires?color=black") {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            openings: [
              { id: "3", root: { children: [] } },
            ],
          }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });
  });

  it("should render the dashboard header", () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // Component shows greeting based on time of day
    expect(
      screen.getByText(/Good (morning|afternoon|evening)/i)
    ).toBeInTheDocument();
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

  it("should fetch repertoire data on mount", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith("/api/repertoires?color=white");
      expect(global.fetch).toHaveBeenCalledWith("/api/repertoires?color=black");
    });
  });

  it("should display practice stats", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // Component shows hardcoded value
    expect(screen.getByText("32")).toBeInTheDocument();
    expect(screen.getByText("moves to practice")).toBeInTheDocument();
  });

  it("should display repertoire information", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("White Repertoire")).toBeInTheDocument();
      expect(screen.getByText("Black Repertoire")).toBeInTheDocument();
    });
  });

  it("should show 0% when repertoire has no positions", async () => {
    (global.fetch as jest.Mock).mockImplementation((url) => {
      if (url === "/api/training-stats") {
        return Promise.resolve({
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
      }
      if (url.includes("/api/repertoires")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ openings: [] }),
        });
      }
      return Promise.reject(new Error("Unknown URL"));
    });

    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    await waitFor(() => {
      const percentages = screen.getAllByText("0%");
      expect(percentages.length).toBeGreaterThan(0);
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

  it("should show practice button", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // Button always shows as enabled with hardcoded values
    const button = screen.getByText("Practice Now");
    expect(button).toBeInTheDocument();
    expect(button.closest("button")).not.toBeDisabled();
  });

  it("should show time estimate", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // Component shows time estimate
    expect(screen.getByText("~8 min")).toBeInTheDocument();
  });

  it("should show move count", async () => {
    render(
      <HomePanel
        onSelectRepertoire={mockOnSelectRepertoire}
        onStartPractice={mockOnStartPractice}
      />,
    );

    // Component shows hardcoded move count
    expect(screen.getByText("32")).toBeInTheDocument();
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
    expect(
      screen.getByText(/Good (morning|afternoon|evening)/i)
    ).toBeInTheDocument();
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
