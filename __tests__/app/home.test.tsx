import React from "react";
import { render, screen } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import Home from "@/app/(app)/page";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

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
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

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
});
