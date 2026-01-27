import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthPage from "@/app/(auth)/auth/page";
import { signIn } from "next-auth/react";

// Mock next-auth
jest.mock("next-auth/react", () => ({
  signIn: jest.fn(),
  useSession: jest.fn(() => ({
    data: null,
    status: "unauthenticated",
  })),
}));

// Mock next/navigation with useSearchParams returning a proper URLSearchParams
jest.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("verified=true"),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
  }),
  usePathname: jest.fn(() => "/auth"),
}));

const mockSignIn = signIn as jest.MockedFunction<typeof signIn>;

describe("AuthPage Component", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock window.location.href
    delete (window as any).location;
    window.location = { href: "" } as any;
  });

  describe("UI Rendering", () => {
    it("should render the auth page with logo and title", () => {
      render(<AuthPage />);

      // Text removed from auth page - now just checks for title
      expect(screen.getByText("Welcome back")).toBeInTheDocument();
    });

    it("should render email and password input fields", () => {
      render(<AuthPage />);

      expect(
        screen.getByPlaceholderText("you@example.com")
      ).toBeInTheDocument();
      expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
    });

    it("should render Google sign-in button", () => {
      render(<AuthPage />);

      expect(screen.getByText("Google")).toBeInTheDocument();
    });

    it("should render sign in/up toggle link", () => {
      render(<AuthPage />);

      expect(screen.getByText("Don't have an account?")).toBeInTheDocument();
      expect(screen.getByText("Sign up")).toBeInTheDocument();
    });
  });

  describe("Toggle between Login and Register", () => {
    it("should toggle from login to register mode", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      expect(screen.getByText("Welcome back")).toBeInTheDocument();
      // Login button is rendered instead of "Sign in" text

      const toggleButton = screen.getByText("Sign up");
      await user.click(toggleButton);

      expect(screen.getByText("Create your account")).toBeInTheDocument();
      expect(screen.getByText("Create account")).toBeInTheDocument();
      expect(screen.getByText("Already have an account?")).toBeInTheDocument();
    });

    it("should toggle back from register to login mode", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      await user.click(screen.getByText("Sign up"));
      expect(screen.getByText("Create your account")).toBeInTheDocument();

      await user.click(screen.getByText("Sign in"));
      expect(screen.getByText("Welcome back")).toBeInTheDocument();
    });
  });

  describe("Form Input and Validation", () => {
    it("should update email and password fields", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      const emailInput = screen.getByPlaceholderText(
        "you@example.com"
      ) as HTMLInputElement;
      const passwordInput = screen.getByPlaceholderText(
        "••••••••"
      ) as HTMLInputElement;

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");

      expect(emailInput.value).toBe("test@example.com");
      expect(passwordInput.value).toBe("password123");
    });

    it("should disable form while loading", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      mockSignIn.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve({ ok: true }), 100);
          })
      );

      const emailInput = screen.getByPlaceholderText("you@example.com");
      const passwordInput = screen.getByPlaceholderText("••••••••");
      const submitButton = screen.getByRole("button", { name: /login/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      expect(emailInput).toBeDisabled();
      expect(passwordInput).toBeDisabled();
      expect(submitButton).toBeDisabled();
    });
  });

  describe("Google Sign In", () => {
    it("should call signIn with google provider", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      const googleButton = screen.getByText("Google");
      await user.click(googleButton);

      expect(mockSignIn).toHaveBeenCalledWith("google", {
        callbackUrl: "/build/color",
      });
    });

    it("should disable Google button while loading", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      mockSignIn.mockImplementation(
        () =>
          new Promise((resolve) => {
            setTimeout(() => resolve(null), 100);
          })
      );

      const googleButton = screen.getByText("Google");
      await user.click(googleButton);

      expect(googleButton).toBeDisabled();
    });
  });

  describe("Credentials Sign In", () => {
    it("should submit login form with correct data", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      mockSignIn.mockResolvedValue({ ok: true });

      const emailInput = screen.getByPlaceholderText("you@example.com");
      const passwordInput = screen.getByPlaceholderText("••••••••");
      const submitButton = screen.getByRole("button", { name: /login/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        email: "test@example.com",
        password: "password123",
        action: "login",
        redirect: false,
      });
    });

    it("should display error message when login fails", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      mockSignIn.mockResolvedValue({
        error: "Invalid email or password",
        ok: false,
      });

      const emailInput = screen.getByPlaceholderText("you@example.com");
      const passwordInput = screen.getByPlaceholderText("••••••••");
      const submitButton = screen.getByRole("button", { name: /login/i });

      await user.type(emailInput, "wrong@example.com");
      await user.type(passwordInput, "wrongpassword");
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText("Invalid email or password")
        ).toBeInTheDocument();
      });
    });

    it("should handle unexpected errors", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      mockSignIn.mockRejectedValue(new Error("Network error"));

      const emailInput = screen.getByPlaceholderText("you@example.com");
      const passwordInput = screen.getByPlaceholderText("••••••••");
      const submitButton = screen.getByRole("button", { name: /login/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(
          screen.getByText("Something went wrong. Please try again.")
        ).toBeInTheDocument();
      });
    });
  });

  describe("Credentials Sign Up", () => {
    it("should submit register form with correct data", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      mockSignIn.mockResolvedValue({ ok: true });

      // Switch to register mode
      await user.click(screen.getByText("Sign up"));

      const emailInput = screen.getByPlaceholderText("you@example.com");
      const passwordInput = screen.getByPlaceholderText("••••••••");
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "newuser@example.com");
      await user.type(passwordInput, "SecurePassword123");
      await user.click(submitButton);

      expect(mockSignIn).toHaveBeenCalledWith("credentials", {
        email: "newuser@example.com",
        password: "SecurePassword123",
        action: "register",
        redirect: false,
      });
    });

    it("should display error when registration fails (user exists)", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      mockSignIn.mockResolvedValue({
        error: "User already exists",
        ok: false,
      });

      await user.click(screen.getByText("Sign up"));

      const emailInput = screen.getByPlaceholderText("you@example.com");
      const passwordInput = screen.getByPlaceholderText("••••••••");
      const submitButton = screen.getByRole("button", {
        name: /create account/i,
      });

      await user.type(emailInput, "existing@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText("User already exists")).toBeInTheDocument();
      });
    });
  });

  describe("Error message styling", () => {
    it("should display error message in red", async () => {
      const user = userEvent.setup();
      render(<AuthPage />);

      mockSignIn.mockResolvedValue({
        error: "Invalid email or password",
        ok: false,
      });

      const emailInput = screen.getByPlaceholderText("you@example.com");
      const passwordInput = screen.getByPlaceholderText("••••••••");
      const submitButton = screen.getByRole("button", { name: /login/i });

      await user.type(emailInput, "test@example.com");
      await user.type(passwordInput, "password123");
      await user.click(submitButton);

      await waitFor(() => {
        const errorMessage = screen.getByText("Invalid email or password");
        expect(errorMessage).toHaveClass("text-red-300");
      });
    });
  });
});
