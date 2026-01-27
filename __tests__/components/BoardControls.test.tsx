import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BoardControls } from "@/components/BoardControls";

describe("BoardControls Component", () => {
  it("should render all control buttons", () => {
    render(<BoardControls />);

    expect(screen.getByTitle("First move")).toBeInTheDocument();
    expect(screen.getByTitle("Previous move")).toBeInTheDocument();
    expect(screen.getByTitle("Next move")).toBeInTheDocument();
    expect(screen.getByTitle("Last move")).toBeInTheDocument();
    expect(screen.getByTitle("Reset board")).toBeInTheDocument();
  });

  it("should call onFirstMove when first move button is clicked", () => {
    const mockOnFirstMove = jest.fn();
    render(<BoardControls onFirstMove={mockOnFirstMove} />);

    fireEvent.click(screen.getByTitle("First move"));
    expect(mockOnFirstMove).toHaveBeenCalledTimes(1);
  });

  it("should call onPreviousMove when previous move button is clicked", () => {
    const mockOnPreviousMove = jest.fn();
    render(<BoardControls onPreviousMove={mockOnPreviousMove} />);

    fireEvent.click(screen.getByTitle("Previous move"));
    expect(mockOnPreviousMove).toHaveBeenCalledTimes(1);
  });

  it("should call onNextMove when next move button is clicked", () => {
    const mockOnNextMove = jest.fn();
    render(<BoardControls onNextMove={mockOnNextMove} />);

    fireEvent.click(screen.getByTitle("Next move"));
    expect(mockOnNextMove).toHaveBeenCalledTimes(1);
  });

  it("should call onLastMove when last move button is clicked", () => {
    const mockOnLastMove = jest.fn();
    render(<BoardControls onLastMove={mockOnLastMove} />);

    fireEvent.click(screen.getByTitle("Last move"));
    expect(mockOnLastMove).toHaveBeenCalledTimes(1);
  });

  it("should call onReset when reset button is clicked", () => {
    const mockOnReset = jest.fn();
    render(<BoardControls onReset={mockOnReset} />);

    fireEvent.click(screen.getByTitle("Reset board"));
    expect(mockOnReset).toHaveBeenCalledTimes(1);
  });

  it("should disable all buttons when isDisabled is true", () => {
    render(<BoardControls isDisabled={true} />);

    expect(screen.getByTitle("First move")).toBeDisabled();
    expect(screen.getByTitle("Previous move")).toBeDisabled();
    expect(screen.getByTitle("Next move")).toBeDisabled();
    expect(screen.getByTitle("Last move")).toBeDisabled();
    expect(screen.getByTitle("Reset board")).toBeDisabled();
  });

  it("should enable all buttons when isDisabled is false", () => {
    render(<BoardControls isDisabled={false} />);

    expect(screen.getByTitle("First move")).not.toBeDisabled();
    expect(screen.getByTitle("Previous move")).not.toBeDisabled();
    expect(screen.getByTitle("Next move")).not.toBeDisabled();
    expect(screen.getByTitle("Last move")).not.toBeDisabled();
    expect(screen.getByTitle("Reset board")).not.toBeDisabled();
  });

  it("should not call handlers when buttons are disabled", () => {
    const mockOnFirstMove = jest.fn();
    render(<BoardControls onFirstMove={mockOnFirstMove} isDisabled={true} />);

    fireEvent.click(screen.getByTitle("First move"));
    expect(mockOnFirstMove).not.toHaveBeenCalled();
  });

  it("should render with proper styling", () => {
    const { container } = render(<BoardControls />);
    const controlsWrapper = container.firstChild;

    expect(controlsWrapper).toHaveClass(
      "glass-card",
      "rounded-2xl",
      "inline-flex",
      "items-center"
    );
  });
});
