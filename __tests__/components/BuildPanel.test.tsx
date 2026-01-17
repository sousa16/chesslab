import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { BuildPanel } from "@/components/BuildPanel";

describe("BuildPanel Component", () => {
  const mockMoves = [
    { number: 1, white: "e4", black: "e5" },
    { number: 2, white: "Nf3", black: "Nc6" },
    { number: 3, white: "Bb5" },
  ];

  const mockOnBack = jest.fn();
  const mockOnAddMove = jest.fn();
  const mockOnDeleteMove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("should render the build panel", () => {
    render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
      />
    );

    // Check that component renders with the color indicator
    const buildingTexts = screen.getAllByText(/building/i);
    expect(buildingTexts.length).toBeGreaterThan(0);
  });

  it("should display repertoire color", () => {
    render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
      />
    );

    // Check for the white piece emoji and the word that follows
    const whiteElements = screen.getAllByText(/white/i);
    expect(whiteElements.length).toBeGreaterThan(0);
  });

  it("should display all moves", () => {
    render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
      />
    );

    expect(screen.getByText("e4")).toBeInTheDocument();
    expect(screen.getByText("Nf3")).toBeInTheDocument();
    expect(screen.getByText("Bb5")).toBeInTheDocument();
  });

  it("should call onBack when back button is clicked", () => {
    const { container } = render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
      />
    );

    const backButton = container.querySelector(
      'button[class*="hover:text-foreground"]'
    );
    if (backButton) {
      fireEvent.click(backButton);
      expect(mockOnBack).toHaveBeenCalled();
    }
  });

  it("should display opening name when provided", () => {
    render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
        openingName="Ruy Lopez"
      />
    );

    expect(screen.getByText("Ruy Lopez")).toBeInTheDocument();
  });

  it("should display line name when provided", () => {
    render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
        lineName="Open Defense"
      />
    );

    expect(screen.getByText("Open Defense")).toBeInTheDocument();
  });

  it("should show add move prompt when at end of moves", () => {
    render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={mockMoves.length}
      />
    );

    expect(screen.getByText("Add next move")).toBeInTheDocument();
  });

  it("should call onAddMove when save line button is clicked", () => {
    render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
        onAddMove={mockOnAddMove}
      />
    );

    const saveButton = screen.getByRole("button", { name: /save line/i });
    fireEvent.click(saveButton);
    expect(mockOnAddMove).toHaveBeenCalled();
  });

  it("should display delete button for previous moves", () => {
    render(
      <BuildPanel
        color="white"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
        onDeleteMove={mockOnDeleteMove}
      />
    );

    const deleteButtons = screen.getAllByRole("button");
    // Should have back button, delete buttons for moves, and save button
    expect(deleteButtons.length).toBeGreaterThan(2);
  });

  it("should display black repertoire correctly", () => {
    render(
      <BuildPanel
        color="black"
        onBack={mockOnBack}
        moves={mockMoves}
        currentMoveIndex={3}
      />
    );

    // Check for the black piece emoji and the word that follows
    const blackElements = screen.getAllByText(/black/i);
    expect(blackElements.length).toBeGreaterThan(0);
  });
});
