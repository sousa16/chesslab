import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SessionProvider } from "next-auth/react";
import Home from "@/app/(app)/page";
import { useSession, signOut } from "next-auth/react";
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
const mockSignOut = signOut as jest.MockedFunction<typeof signOut>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe("Home Page (Authenticated)", () => {
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

  describe("Authentication State", () => {
    it("should show loading state when session is loading", () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: "loading",
        update: jest.fn(),
      } as any);

      render(<Home />);

      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should redirect to /auth when user is not authenticated", async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: "unauthenticated",
        update: jest.fn(),
      } as any);

      render(<Home />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/auth");
      });
    });

    it("should render home page when user is authenticated", () => {
      mockUseSession.mockReturnValue({
        data: mockSession,
        status: "authenticated",
        update: jest.fn(),
      } as any);

      render(<Home />);

      expect(screen.getByText("ChessLab")).toBeInTheDocument();
      expect(
        screen.getByText("Master your opening repertoire")
      ).toBeInTheDocument();
    });
  });

  describe("UI Elements", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: mockSession,
        status: "authenticated",
        update: jest.fn(),
      } as any);
    });

    it("should render header with app title", () => {
      render(<Home />);

      expect(screen.getByText("ChessLab")).toBeInTheDocument();
      expect(
        screen.getByText("Master your opening repertoire")
      ).toBeInTheDocument();
    });

    it("should display user welcome message with name", () => {
      render(<Home />);

      expect(screen.getByText("Welcome, Test User!")).toBeInTheDocument();
    });

    it("should display user email", () => {
      render(<Home />);

      expect(screen.getByText("test@example.com")).toBeInTheDocument();
    });

    it("should use email as fallback when name is not available", () => {
      const sessionWithoutName = {
        user: {
          id: "user-123",
          email: "user@example.com",
          name: null,
        },
      };

      mockUseSession.mockReturnValue({
        data: sessionWithoutName,
        status: "authenticated",
        update: jest.fn(),
      } as any);

      render(<Home />);

      expect(
        screen.getByText("Welcome, user@example.com!")
      ).toBeInTheDocument();
    });

    it("should render Repertoire section", () => {
      render(<Home />);

      // Repertoire and Training links should not be present yet
      expect(
        screen.queryByText("Manage your opening repertoire and study positions")
      ).not.toBeInTheDocument();
    });

    it("should render Training section", () => {
      render(<Home />);

      // Training link should not be present yet
      expect(
        screen.queryByText(
          "Practice your opening knowledge with interactive exercises"
        )
      ).not.toBeInTheDocument();
    });

    it("should render Sign Out button", () => {
      render(<Home />);

      expect(
        screen.getByRole("button", { name: /sign out/i })
      ).toBeInTheDocument();
    });
  });

  describe("Navigation", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: mockSession,
        status: "authenticated",
        update: jest.fn(),
      } as any);
    });

    it("should not have navigation links yet", () => {
      render(<Home />);

      expect(
        screen.queryByRole("link", { name: /repertoire/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /training/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("Sign Out Functionality", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: mockSession,
        status: "authenticated",
        update: jest.fn(),
      } as any);
    });

    it("should call signOut with correct callback when Sign Out button is clicked", async () => {
      render(<Home />);

      const signOutButton = screen.getByRole("button", { name: /sign out/i });
      fireEvent.click(signOutButton);

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/auth" });
      });
    });
  });

  describe("Accessibility", () => {
    beforeEach(() => {
      mockUseSession.mockReturnValue({
        data: mockSession,
        status: "authenticated",
        update: jest.fn(),
      } as any);
    });

    it("should have proper heading hierarchy", () => {
      render(<Home />);

      const h1 = screen.getByRole("heading", { level: 1 });
      expect(h1).toHaveTextContent("ChessLab");

      const h2 = screen.getByRole("heading", { level: 2 });
      expect(h2).toHaveTextContent(/Welcome/);
    });

    it("should have proper button roles", () => {
      render(<Home />);

      const signOutButton = screen.getByRole("button", { name: /sign out/i });
      expect(signOutButton).toBeInTheDocument();
    });
  });
});
