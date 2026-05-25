import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { LineTree } from "@/components/repertoire/LineTree";

function makeLeaf(
  overrides: Partial<{
    id: string;
    fen: string;
    displaySequence: string;
    sanMoves: string[];
    openingName: string | null;
    openingEco: string | null;
  }> = {},
) {
  return {
    id: "leaf-1",
    fen: "rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2",
    expectedMove: "g1f3",
    moveNumber: 3,
    displaySequence: "1.e4 c5 2.Nf3",
    sanMoves: ["e4", "c5", "Nf3"],
    openingName: "Sicilian Defense",
    openingEco: "B20",
    children: [],
    ...overrides,
  };
}

function makeRoot(leaves: ReturnType<typeof makeLeaf>[]) {
  return {
    id: "root",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    expectedMove: "",
    moveNumber: 0,
    displaySequence: "Initial Position",
    sanMoves: [] as string[],
    openingName: null,
    openingEco: null,
    children: leaves.map((leaf) => ({
      id: `branch-${leaf.id}`,
      fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
      expectedMove: "e2e4",
      moveNumber: 1,
      displaySequence: "1.e4",
      sanMoves: ["e4"],
      openingName: leaf.openingName,
      openingEco: null,
      children: [leaf],
    })),
  };
}

describe("LineTree Component", () => {
  const mockOnBuild = jest.fn();
  const mockOnLearn = jest.fn();
  const mockOnDelete = jest.fn().mockResolvedValue(undefined);
  const mockOnLineClick = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockOnDelete.mockResolvedValue(undefined);
  });

  it("renders nothing when there are no leaves", () => {
    const { container } = render(
      <LineTree
        root={{
          id: "root",
          fen: "start",
          expectedMove: "",
          moveNumber: 0,
          displaySequence: "Initial Position",
          sanMoves: [],
          openingName: null,
          openingEco: null,
          children: [],
        }}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("groups leaves by opening family and shows displaySequence", () => {
    render(
      <LineTree
        root={makeRoot([makeLeaf()])}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
        onLineClick={mockOnLineClick}
      />,
    );

    expect(screen.getByText("Sicilian Defense")).toBeInTheDocument();
    expect(screen.getByText("1.e4 c5 2.Nf3")).toBeInTheDocument();
    expect(screen.queryByText("Initial Position")).not.toBeInTheDocument();
  });

  it("puts unnamed openings under Other Lines", () => {
    render(
      <LineTree
        root={makeRoot([makeLeaf({ openingName: null, id: "x" })])}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
      />,
    );
    expect(screen.getByText("Other Lines")).toBeInTheDocument();
  });

  it("calls onLineClick with sanMoves when a line is clicked", () => {
    const leaf = makeLeaf();
    render(
      <LineTree
        root={makeRoot([leaf])}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
        onLineClick={mockOnLineClick}
      />,
    );

    fireEvent.click(screen.getByText(leaf.displaySequence));
    expect(mockOnLineClick).toHaveBeenCalledWith(
      leaf.sanMoves,
      leaf.openingName,
      leaf.openingEco,
    );
  });

  it("collapses and expands a multi-line family", () => {
    const root = makeRoot([
      makeLeaf({ id: "a", displaySequence: "1.e4 c5 2.Nf3" }),
      makeLeaf({
        id: "b",
        displaySequence: "1.e4 e5 2.Nf3",
        sanMoves: ["e4", "e5", "Nf3"],
      }),
    ]);

    render(
      <LineTree
        root={root}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
        onLineClick={mockOnLineClick}
      />,
    );

    // Families with more than one line start collapsed.
    expect(screen.queryByText("1.e4 c5 2.Nf3")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Sicilian Defense"));
    expect(screen.getByText("1.e4 c5 2.Nf3")).toBeInTheDocument();
    expect(screen.getByText("1.e4 e5 2.Nf3")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Sicilian Defense"));
    expect(screen.queryByText("1.e4 c5 2.Nf3")).not.toBeInTheDocument();
  });

  it("calls onBuild and onLearn from line action buttons", () => {
    const { container } = render(
      <LineTree
        root={makeRoot([makeLeaf()])}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
      />,
    );

    const buildBtn = container.querySelector(
      'button[title="Continue building from here"]',
    );
    const learnBtn = container.querySelector('button[title="Practice this line"]');
    expect(buildBtn).toBeTruthy();
    expect(learnBtn).toBeTruthy();

    fireEvent.click(buildBtn!);
    fireEvent.click(learnBtn!);
    expect(mockOnBuild).toHaveBeenCalled();
    expect(mockOnLearn).toHaveBeenCalled();
  });

  it("shows delete control when onDelete is provided", () => {
    const { container } = render(
      <LineTree
        root={makeRoot([makeLeaf()])}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
        onDelete={mockOnDelete}
      />,
    );

    expect(
      container.querySelector('button[title="Delete this line"]'),
    ).toBeTruthy();
  });

  it("hides delete control when onDelete is omitted", () => {
    const { container } = render(
      <LineTree
        root={makeRoot([makeLeaf()])}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
      />,
    );

    expect(
      container.querySelector('button[title="Delete this line"]'),
    ).toBeNull();
  });

  it("calls onDelete after confirm", () => {
    const confirmSpy = jest.spyOn(window, "confirm").mockReturnValue(true);

    const { container } = render(
      <LineTree
        root={makeRoot([makeLeaf({ id: "del-me" })])}
        onBuild={mockOnBuild}
        onLearn={mockOnLearn}
        onDelete={mockOnDelete}
      />,
    );

    fireEvent.click(
      container.querySelector('button[title="Delete this line"]')!,
    );

    expect(mockOnDelete).toHaveBeenCalledWith("del-me");
    confirmSpy.mockRestore();
  });
});
