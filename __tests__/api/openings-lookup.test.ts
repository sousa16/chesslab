import { GET } from "@/app/api/openings/lookup/route";
import { NextRequest } from "next/server";
import { lookupOpening } from "@/lib/openings";

jest.mock("@/lib/openings", () => ({
  lookupOpening: jest.fn(),
}));

const mockLookup = lookupOpening as jest.MockedFunction<typeof lookupOpening>;

describe("GET /api/openings/lookup", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null match (cached) when no moves are provided", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/openings/lookup?moves="),
    );
    const body = await res.json();
    expect(body).toEqual({ match: null });
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
    // Cheap short-circuit — the lib shouldn't be called.
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("returns null match (cached) when moves query is missing entirely", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/openings/lookup"),
    );
    const body = await res.json();
    expect(body).toEqual({ match: null });
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it("parses comma-separated moves and forwards them to the lookup library", async () => {
    mockLookup.mockReturnValue({ eco: "B20", name: "Sicilian Defense" });
    const res = await GET(
      new NextRequest("http://localhost/api/openings/lookup?moves=e4,c5"),
    );
    const body = await res.json();
    expect(mockLookup).toHaveBeenCalledWith(["e4", "c5"]);
    expect(body).toEqual({
      match: { eco: "B20", name: "Sicilian Defense" },
    });
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, immutable",
    );
  });

  it("trims whitespace and drops empty entries before lookup", async () => {
    mockLookup.mockReturnValue(null);
    const res = await GET(
      new NextRequest(
        "http://localhost/api/openings/lookup?moves=%20e4%20,,%20c5%20",
      ),
    );
    expect(res.status).toBe(200);
    expect(mockLookup).toHaveBeenCalledWith(["e4", "c5"]);
  });

  it("returns a null match (still cached) when no opening matches", async () => {
    mockLookup.mockReturnValue(null);
    const res = await GET(
      new NextRequest("http://localhost/api/openings/lookup?moves=ZZZ"),
    );
    const body = await res.json();
    expect(body).toEqual({ match: null });
    expect(res.headers.get("Cache-Control")).toBe(
      "public, max-age=3600, immutable",
    );
  });
});
