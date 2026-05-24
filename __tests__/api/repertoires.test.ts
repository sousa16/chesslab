import { GET } from "@/app/api/repertoires/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/openings", () => ({
  lookupOpening: jest.fn(() => ({ name: "Sicilian Defense", eco: "B20" })),
}));

jest.mock("@/lib/repertoireTree", () => ({
  buildRepertoireTree: jest.fn(() => ({
    roots: [
      {
        id: "entry-1",
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
        expectedMove: "e2e4",
        sanMoves: ["e4"],
        rootFen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        children: [],
        opponentMove: undefined,
      },
    ],
    byEntryId: new Map(),
  })),
  anchorSansToStart: jest.fn((sans: string[]) => sans),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repertoireEntry: {
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    repertoire: {
      findUnique: jest.fn(),
    },
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("GET /api/repertoires", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1" },
    } as any);
    mockPrisma.repertoireEntry.findFirst.mockResolvedValue({
      updatedAt: new Date("2024-01-01"),
    } as any);
    mockPrisma.repertoireEntry.count.mockResolvedValue(1);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET(
      new NextRequest("http://localhost/api/repertoires?color=white"),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid color", async () => {
    const res = await GET(
      new NextRequest("http://localhost/api/repertoires?color=red"),
    );
    expect(res.status).toBe(400);
  });

  it("returns 304 when If-None-Match matches etag", async () => {
    const updatedAt = new Date("2024-06-01T12:00:00Z");
    mockPrisma.repertoireEntry.findFirst.mockResolvedValue({
      updatedAt,
    } as any);
    mockPrisma.repertoireEntry.count.mockResolvedValue(3);
    const etag = `W/"${updatedAt.getTime()}-3"`;

    const res = await GET(
      new NextRequest("http://localhost/api/repertoires?color=white", {
        headers: { "if-none-match": etag },
      }),
    );

    expect(res.status).toBe(304);
    expect(mockPrisma.repertoire.findUnique).not.toHaveBeenCalled();
  });

  it("returns empty openings when repertoire has no entries", async () => {
    mockPrisma.repertoire.findUnique.mockResolvedValue(null);

    const res = await GET(
      new NextRequest("http://localhost/api/repertoires?color=white"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({ openings: [] });
  });

  it("returns root tree when repertoire has entries", async () => {
    mockPrisma.repertoire.findUnique.mockResolvedValue({
      id: "rep-1",
      color: "White",
      entries: [
        {
          id: "entry-1",
          expectedMove: "e2e4",
          phase: "learning",
          position: {
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPPPPPP/RNBQKBNR b KQkq - 0 1",
          },
        },
      ],
    } as any);

    const res = await GET(
      new NextRequest("http://localhost/api/repertoires?color=white"),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.root).toBeDefined();
    expect(res.headers.get("etag")).toMatch(/^W\/"/);
  });
});
