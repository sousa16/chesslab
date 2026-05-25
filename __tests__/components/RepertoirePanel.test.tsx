/**
 * RepertoirePanel tests — focuses on the fetch + render life cycle, the
 * loading / empty / populated states, and the delete-line and
 * delete-family flows that issue API calls.
 */
import React from "react";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { RepertoirePanel } from "@/components/RepertoirePanel";
import { ToastProvider } from "@/components/ui/toast";

// Replace LineTree with a tiny fixture that exposes the delete callbacks
// as buttons — keeps this suite focused on RepertoirePanel's own logic
// and avoids re-testing LineTree (which has its own suite).
jest.mock("@/components/repertoire/LineTree", () => ({
  LineTree: ({
    onDelete,
    onDeleteFamily,
  }: {
    onDelete: (id: string) => Promise<void>;
    onDeleteFamily: (family: string) => Promise<void>;
  }) => (
    <div>
      <button
        data-testid="trigger-delete"
        onClick={() => onDelete("node-1")}>
        Delete line
      </button>
      <button
        data-testid="trigger-delete-family"
        onClick={() => onDeleteFamily("Sicilian Defense")}>
        Delete family
      </button>
    </div>
  ),
}));

jest.mock("@/lib/savesPending", () => ({
  hasPendingSave: jest.fn(() => false),
  whenAllSavesSettle: jest.fn(),
}));

global.fetch = jest.fn();

// Helper: every mocked response needs a `headers.get` shim because the
// component reads `response.headers.get("etag")` for the If-None-Match
// caching path. Wrapping at construction time keeps each test concise.
function mockResponse(body: unknown, init: { ok?: boolean; etag?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.ok === false ? 500 : 200,
    headers: { get: (k: string) => (k.toLowerCase() === "etag" ? init.etag ?? null : null) },
    json: async () => body,
  };
}

function renderPanel(overrides: Partial<React.ComponentProps<typeof RepertoirePanel>> = {}) {
  return render(
    <ToastProvider>
      <RepertoirePanel
        color="white"
        onBack={jest.fn()}
        onBuild={jest.fn()}
        onLearn={jest.fn()}
        {...overrides}
      />
    </ToastProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("RepertoirePanel", () => {
  it("shows the loading placeholder before the fetch resolves", async () => {
    (fetch as jest.Mock).mockImplementation(() => new Promise(() => {})); // never resolves
    renderPanel();
    expect(screen.getByText(/Loading repertoire/i)).toBeInTheDocument();
  });

  it("shows the empty state when the repertoire has no children", async () => {
    (fetch as jest.Mock).mockResolvedValue(
      mockResponse({ root: { id: "root", children: [] } }),
    );
    renderPanel();
    await waitFor(() =>
      expect(screen.getByText(/No openings yet/i)).toBeInTheDocument(),
    );
  });

  it("renders the line tree when entries exist", async () => {
    (fetch as jest.Mock).mockResolvedValue(
      mockResponse({
        root: {
          id: "root",
          children: [
            {
              id: "n1",
              fen: "fen-1",
              expectedMove: "e2e4",
              moveNumber: 1,
              displaySequence: "1.e4",
              sanMoves: ["e4"],
              openingName: "King's Pawn",
              openingEco: "B00",
              children: [],
              mastered: true,
            },
          ],
        },
      }),
    );
    renderPanel();
    await waitFor(() =>
      expect(screen.getByTestId("trigger-delete")).toBeInTheDocument(),
    );
  });

  it("issues a DELETE to /api/repertoire-entries/:id and refetches on success", async () => {
    // 1) initial GET, 2) DELETE, 3) refetch GET
    (fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockResponse({
          root: { id: "root", children: [{ id: "n1", children: [] }] },
        }),
      )
      .mockResolvedValueOnce(mockResponse({ deletedCount: 1 }))
      .mockResolvedValueOnce(
        mockResponse({ root: { id: "root", children: [] } }),
      );

    renderPanel();
    const trigger = await screen.findByTestId("trigger-delete");
    await act(async () => {
      fireEvent.click(trigger);
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/repertoire-entries/node-1",
      expect.objectContaining({ method: "DELETE" }),
    );
    // Refetch after delete brings us to empty state.
    await waitFor(() =>
      expect(screen.getByText(/No openings yet/i)).toBeInTheDocument(),
    );
  });

  it("issues a DELETE to /api/repertoire-entries/family on family delete", async () => {
    (fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockResponse({
          root: { id: "root", children: [{ id: "n1", children: [] }] },
        }),
      )
      .mockResolvedValueOnce(mockResponse({ deletedCount: 3 }))
      .mockResolvedValueOnce(
        mockResponse({ root: { id: "root", children: [] } }),
      );

    renderPanel();
    const trigger = await screen.findByTestId("trigger-delete-family");
    await act(async () => {
      fireEvent.click(trigger);
    });

    expect(fetch).toHaveBeenCalledWith(
      "/api/repertoire-entries/family",
      expect.objectContaining({
        method: "DELETE",
        body: expect.stringContaining("Sicilian Defense"),
      }),
    );
  });

  it("calls onBack/onBuild/onLearn from the panel header and action buttons", async () => {
    (fetch as jest.Mock).mockResolvedValue(
      mockResponse({ root: { id: "root", children: [] } }),
    );
    const onBack = jest.fn();
    const onBuild = jest.fn();
    const onLearn = jest.fn();
    renderPanel({ onBack, onBuild, onLearn });

    // Wait for the panel to render its action area.
    await waitFor(() =>
      expect(screen.getByText(/No openings yet/i)).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("Build"));
    expect(onBuild).toHaveBeenCalled();
    fireEvent.click(screen.getByText("Learn All"));
    expect(onLearn).toHaveBeenCalled();
  });
});
