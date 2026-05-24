import { DELETE } from "@/app/api/repertoire-entries/family/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/repertoireLeaves", () => ({
  recomputeRepertoireLeaves: jest.fn(),
}));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return { ...actual, after: jest.fn() };
});

jest.mock("@/lib/openings", () => ({
  lookupOpening: jest.fn(() => ({ name: "Caro-Kann Defense: Main Line", eco: "B12" })),
}));

const leafNode = {
  id: "e1",
  fen: "fen1",
  expectedMove: "e2e4",
  sanMoves: ["e4"],
  rootFen: "start",
  children: [] as never[],
  opponentMove: undefined,
};

jest.mock("@/lib/repertoireTree", () => ({
  buildRepertoireTree: jest.fn(() => ({
    roots: [leafNode],
    byEntryId: new Map([["e1", leafNode]]),
  })),
  anchorSansToStart: jest.fn((sans: string[]) => sans),
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repertoire: {
      findUnique: jest.fn(),
    },
    repertoireEntry: {
      deleteMany: jest.fn(),
    },
    position: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function deleteFamily(body: object) {
  return DELETE(
    new NextRequest("http://localhost/api/repertoire-entries/family", {
      method: "DELETE",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("DELETE /api/repertoire-entries/family", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } } as any);
    mockPrisma.position.findMany.mockResolvedValue([]);
    mockPrisma.position.deleteMany.mockResolvedValue({ count: 0 });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await deleteFamily({
      color: "white",
      family: "Caro-Kann Defense",
    });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid color", async () => {
    const res = await deleteFamily({ color: "red", family: "Caro-Kann Defense" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when family is missing", async () => {
    const res = await deleteFamily({ color: "white", family: "" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for Other Lines bucket", async () => {
    const res = await deleteFamily({ color: "white", family: "Other Lines" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when repertoire not found", async () => {
    mockPrisma.repertoire.findUnique.mockResolvedValue(null);
    const res = await deleteFamily({
      color: "white",
      family: "Caro-Kann Defense",
    });
    expect(res.status).toBe(404);
  });

  it("deletes matching entries by family", async () => {
    mockPrisma.repertoire.findUnique.mockResolvedValue({
      id: "rep-1",
      color: "White",
      entries: [
        {
          id: "e1",
          expectedMove: "e2e4",
          position: { fen: "fen1" },
        },
      ],
    } as any);
    mockPrisma.repertoireEntry.deleteMany.mockResolvedValue({ count: 1 });

    const res = await deleteFamily({
      color: "white",
      family: "Caro-Kann Defense",
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.deletedCount).toBe(1);
    expect(mockPrisma.repertoireEntry.deleteMany).toHaveBeenCalled();
  });
});
