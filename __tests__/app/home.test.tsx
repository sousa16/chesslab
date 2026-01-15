import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import Home from "@/app/(app)/page";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";

// Mock next-auth/react
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

// Mock Board component
jest.mock("@/components/Board", () => ({
  Board: React.forwardRef(({ playerColor, onMoveMade }: any, ref: any) => (
    <div
      data-testid="chessboard"
      data-player-color={playerColor}
      onClick={() =>
        onMoveMade?.({
          from: "e2",
          to: "e4",
          san: "e4",
        })
      }>
      Board Component
    </div>
  )),
  BoardHandle: {},
}));

// Mock BoardControls component
jest.mock("@/components/BoardControls", () => ({
  BoardControls: ({
    onFirstMove,
    onPreviousMove,
    onNextMove,
    onLastMove,
    onReset,
  }: any) => (
    <div data-testid="board-controls">
      <button title="First move" onClick={onFirstMove} />
      <button title="Previous move" onClick={onPreviousMove} />
      <button title="Next move" onClick={onNextMove} />
      <button title="Last move" onClick={onLastMove} />
      <button title="Reset board" onClick={onReset} />
    </div>
  ),
}));

// Mock HomePanel and RepertoirePanel
jest.mock("@/components/HomePanel", () => ({
  HomePanel: () => (
    <div>
      <div>Dashboard</div>
      <div>White Repertoire</div>
      <div>Black Repertoire</div>
      <div>Daily Tasks</div>
      <div>Lines Learned</div>
      <div>Accuracy</div>
      <div>Streak</div>
      <button>Practice Now</button>
    </div>
  ),
}));

jest.mock("@/components/RepertoirePanel", () => ({
  RepertoirePanel: () => <div>Repertoire Panel</div>,
}));

jest.mock("@/components/Logo", () => ({
  Logo: () => <div>Logo</div>,
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;
const mockUseSearchParams = useSearchParams as jest.MockedFunction<
  typeof useSearchParams
>;

describe("Home Page", () => {
  const mockSession = {
    user: {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
    },
  };

  const mockPush = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue({
      push: mockPush,
      replace: jest.fn(),
      prefetch: jest.fn(),
    } as any);
    // Mock useSearchParams to return empty params by default
    mockUseSearchParams.mockReturnValue({
      get: jest.fn(() => null),
    } as any);
  });

  it("should show loading state when session is loading", () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: "loading",
      update: jest.fn(),
    } as any);

    render(<Home />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("should redirect to auth when unauthenticated", () => {
    mockUseSession.mockReturnValue({
      data: null,
      status: "unauthenticated",
      update: jest.fn(),
    } as any);

    render(<Home />);

    expect(mockPush).toHaveBeenCalledWith("/auth");
  });

  it("should render home page when user is authenticated", () => {
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);

    const { container } = render(<Home />);

    // Check that main layout rendered
    expect(container.querySelector(".min-h-screen")).toBeInTheDocument();
  });

  it("should render dashboard with repertoire panels when authenticated", () => {
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);

    render(<Home />);

    const dashboard = screen.getByText("Dashboard");
    expect(dashboard).toBeInTheDocument();

    const whiteRepertoire = screen.getByText("White Repertoire");
    expect(whiteRepertoire).toBeInTheDocument();

    const blackRepertoire = screen.getByText("Black Repertoire");
    expect(blackRepertoire).toBeInTheDocument();
  });

  it("should display daily tasks section", () => {
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);

    render(<Home />);

    const dailyTasks = screen.getByText("Daily Tasks");
    expect(dailyTasks).toBeInTheDocument();

    const practiceButton = screen.getByRole("button", {
      name: /practice now/i,
    });
    expect(practiceButton).toBeInTheDocument();
  });

  it("should display progress statistics", () => {
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);

    render(<Home />);

    expect(screen.getByText("Lines Learned")).toBeInTheDocument();
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("Streak")).toBeInTheDocument();
  });

  it("should render board and controls when authenticated", () => {
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);

    render(<Home />);

    // Check for board and control buttons
    expect(screen.getByTestId("chessboard")).toBeInTheDocument();
    expect(screen.getByTitle("First move")).toBeInTheDocument();
    expect(screen.getByTitle("Previous move")).toBeInTheDocument();
    expect(screen.getByTitle("Next move")).toBeInTheDocument();
    expect(screen.getByTitle("Last move")).toBeInTheDocument();
    expect(screen.getByTitle("Reset board")).toBeInTheDocument();
  });

  it("should have rotate board button", () => {
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);

    render(<Home />);

    expect(screen.getByTitle("Rotate board")).toBeInTheDocument();
  });

  it("should navigate to build white page when a move is made with white", () => {
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);

    render(<Home />);

    // Click the board to trigger onMoveMade (simulating a move)
    fireEvent.click(screen.getByTestId("chessboard"));

    // Verify navigation to build/white with the move
    expect(mockPush).toHaveBeenCalledWith("/build/white?move=e4");
  });

  it("should navigate to build black page when a move is made with black", () => {
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);

    const { rerender } = render(<Home />);

    // Rotate board to black
    fireEvent.click(screen.getByTitle("Rotate board"));

    // Click the board to trigger onMoveMade (simulating a move)
    fireEvent.click(screen.getByTestId("chessboard"));

    // Verify navigation to build/black with the move
    expect(mockPush).toHaveBeenCalledWith("/build/black?move=e4");
  });
});
