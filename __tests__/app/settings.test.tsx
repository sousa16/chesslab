import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { SettingsModal } from "@/components/SettingsModal";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { ToastProvider } from "@/components/ui/toast";

// Mock next-auth/react
jest.mock("next-auth/react", () => ({
  useSession: jest.fn(),
  signOut: jest.fn(),
}));

// Mock next/navigation
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
  usePathname: jest.fn(() => "/settings"),
}));

// Mock fetch
global.fetch = jest.fn();

const mockUseSession = useSession as jest.MockedFunction<typeof useSession>;

describe("Settings Modal", () => {
  const mockSession = {
    user: {
      id: "user-123",
      email: "test@example.com",
      name: "Test User",
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseSession.mockReturnValue({
      data: mockSession as any,
      status: "authenticated",
      update: jest.fn(),
    } as any);
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderWithProviders = (component: React.ReactElement) => {
    return render(
      <SettingsProvider>
        <ToastProvider>{component}</ToastProvider>
      </SettingsProvider>
    );
  };

  it("should render settings modal when open", () => {
    renderWithProviders(
      <SettingsModal open={true} onOpenChange={jest.fn()} />
    );

    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("should not render settings modal when closed", () => {
    renderWithProviders(
      <SettingsModal open={false} onOpenChange={jest.fn()} />
    );

    // Settings text should not be visible when closed
    const settingsTitle = screen.queryByText("Settings");
    expect(settingsTitle).not.toBeInTheDocument();
  });

  it("should display account section with user email", () => {
    renderWithProviders(
      <SettingsModal open={true} onOpenChange={jest.fn()} />
    );

    // Should show the account section
    expect(screen.getByText("Account")).toBeInTheDocument();
    // Email appears in account info
    expect(screen.getAllByText("test@example.com").length).toBeGreaterThan(0);
  });

  it("should display appearance section", () => {
    renderWithProviders(
      <SettingsModal open={true} onOpenChange={jest.fn()} />
    );

    // Should show appearance section
    expect(screen.getByText("Appearance")).toBeInTheDocument();
  });

  it("should display training section", () => {
    renderWithProviders(
      <SettingsModal open={true} onOpenChange={jest.fn()} />
    );

    // Should show training section
    expect(screen.getByText("Training")).toBeInTheDocument();
  });

  it("should display danger zone section", () => {
    renderWithProviders(
      <SettingsModal open={true} onOpenChange={jest.fn()} />
    );

    // Should show danger zone
    expect(screen.getByText("Danger Zone")).toBeInTheDocument();
  });
});
