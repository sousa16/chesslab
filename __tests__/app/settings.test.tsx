import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import SettingsPage from "@/app/(app)/settings/page";

// Mock next-auth/react
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;
const mockSignOut = signOut as jest.MockedFunction<typeof signOut>;
const mockUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

describe("Settings Page", () => {
  const mockSession = {
    user: {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
    },
  };

  const mockPush = jest.fn();
  const mockRouter = {
    push: mockPush,
    back: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseRouter.mockReturnValue(mockRouter as any);
    mockUseSession.mockReturnValue({
      data: mockSession,
      status: "authenticated",
      update: jest.fn(),
    } as any);
  });

  describe("Authentication", () => {
    it("should show loading state when session is loading", () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: "loading",
        update: jest.fn(),
      } as any);

      render(<SettingsPage />);
      expect(screen.getByText("Loading...")).toBeInTheDocument();
    });

    it("should redirect to auth when user is not authenticated", async () => {
      mockUseSession.mockReturnValue({
        data: null,
        status: "unauthenticated",
        update: jest.fn(),
      } as any);

      render(<SettingsPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/auth");
      });
    });
  });

  describe("Rendering", () => {
    it("should render settings page header", () => {
      render(<SettingsPage />);
      expect(screen.getByText("Settings")).toBeInTheDocument();
    });

    it("should display back button", () => {
      render(<SettingsPage />);
      const backButton = screen.getByRole("button", { name: "" }).parentElement;
      expect(backButton).toBeInTheDocument();
    });

    it("should display user email in account section", () => {
      render(<SettingsPage />);
      expect(screen.getByText(mockSession.user?.email)).toBeInTheDocument();
    });

    it("should display free plan label", () => {
      render(<SettingsPage />);
      expect(screen.getByText("Free plan")).toBeInTheDocument();
    });

    it("should render all training settings", () => {
      render(<SettingsPage />);
      expect(screen.getByText("Daily reminder")).toBeInTheDocument();
      expect(screen.getByText("Sound effects")).toBeInTheDocument();
      expect(screen.getByText("Show coordinates")).toBeInTheDocument();
    });

    it("should display version number", () => {
      render(<SettingsPage />);
      expect(screen.getByText("Version 1.0.0")).toBeInTheDocument();
    });
  });

  describe("Navigation", () => {
    it("should navigate to home when back button is clicked", () => {
      render(<SettingsPage />);
      const buttons = screen.getAllByRole("button");
      fireEvent.click(buttons[0]); // First button is back button
      expect(mockPush).toHaveBeenCalledWith("/");
    });
  });

  describe("Sign Out", () => {
    it("should render sign out button", () => {
      render(<SettingsPage />);
      expect(screen.getByText("Sign out")).toBeInTheDocument();
    });

    it("should call signOut and redirect on sign out", async () => {
      mockSignOut.mockResolvedValue(undefined);

      render(<SettingsPage />);
      const signOutButton = screen.getByText("Sign out");
      fireEvent.click(signOutButton);

      await waitFor(() => {
        expect(mockSignOut).toHaveBeenCalledWith({ redirect: false });
        expect(mockPush).toHaveBeenCalledWith("/auth");
      });
    });
  });

  describe("UI Components", () => {
    it("should have proper section headers", () => {
      render(<SettingsPage />);
      expect(screen.getByText("Account")).toBeInTheDocument();
      expect(screen.getByText("Training")).toBeInTheDocument();
    });

    it("should render switch components for training settings", () => {
      const { container } = render(<SettingsPage />);
      const switches = container.querySelectorAll('[role="switch"]');
      expect(switches.length).toBeGreaterThan(0);
    });

    it("should have proper styling classes", () => {
      const { container } = render(<SettingsPage />);
      const mainDiv = container.firstChild;
      expect(mainDiv).toHaveClass("min-h-screen", "bg-background");
    });
  });

  describe("Sections", () => {
    it("should render account section with user icon", () => {
      const { container } = render(<SettingsPage />);
      const accountSection = container.querySelector("section");
      expect(accountSection).toBeInTheDocument();
    });

    it("should render training section with multiple options", () => {
      render(<SettingsPage />);
      const descriptions = screen.getAllByText(
        /Get notified|Play sounds|Display board/
      );
      expect(descriptions.length).toBe(3);
    });
  });
});
