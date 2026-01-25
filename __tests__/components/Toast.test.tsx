import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/components/ui/toast";

// Test component that triggers toasts
function TestComponent() {
  const { showToast } = useToast();

  return (
    <div>
      <button onClick={() => showToast("Success message", "success")}>
        Show Success
      </button>
      <button onClick={() => showToast("Error message", "error")}>
        Show Error
      </button>
      <button onClick={() => showToast("Warning message", "warning")}>
        Show Warning
      </button>
    </div>
  );
}

describe("Toast Component", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("should render children without toasts initially", () => {
    render(
      <ToastProvider>
        <div>Child content</div>
      </ToastProvider>,
    );

    expect(screen.getByText("Child content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("should show a success toast when triggered", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Success"));

    expect(screen.getByText("Success message")).toBeInTheDocument();
  });

  it("should show an error toast when triggered", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Error"));

    expect(screen.getByText("Error message")).toBeInTheDocument();
  });

  it("should show a warning toast when triggered", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Warning"));

    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should auto-dismiss toast after 4 seconds", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Success"));
    expect(screen.getByText("Success message")).toBeInTheDocument();

    // Fast-forward 4 seconds
    act(() => {
      jest.advanceTimersByTime(4000);
    });

    expect(screen.queryByText("Success message")).not.toBeInTheDocument();
  });

  it("should dismiss toast when close button is clicked", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Success"));
    expect(screen.getByText("Success message")).toBeInTheDocument();

    // Find and click the dismiss button (X icon button)
    const dismissButton = screen
      .getByText("Success message")
      .parentElement?.querySelector("button");
    if (dismissButton) {
      fireEvent.click(dismissButton);
    }

    expect(screen.queryByText("Success message")).not.toBeInTheDocument();
  });

  it("should display multiple toasts at once", () => {
    render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Success"));
    fireEvent.click(screen.getByText("Show Error"));
    fireEvent.click(screen.getByText("Show Warning"));

    expect(screen.getByText("Success message")).toBeInTheDocument();
    expect(screen.getByText("Error message")).toBeInTheDocument();
    expect(screen.getByText("Warning message")).toBeInTheDocument();
  });

  it("should throw error when useToast is used outside ToastProvider", () => {
    // Suppress console.error for this test
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow("useToast must be used within a ToastProvider");

    consoleSpy.mockRestore();
  });

  it("should render toast in center of screen", () => {
    const { container } = render(
      <ToastProvider>
        <TestComponent />
      </ToastProvider>,
    );

    fireEvent.click(screen.getByText("Show Success"));

    // Check that the toast container has the correct positioning classes
    const toastContainer = container.querySelector(".fixed.top-1\\/2");
    expect(toastContainer).toBeInTheDocument();
    expect(toastContainer).toHaveClass("left-1/2");
    expect(toastContainer).toHaveClass("-translate-x-1/2");
    expect(toastContainer).toHaveClass("-translate-y-1/2");
  });
});
