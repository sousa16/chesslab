import { GET, PATCH } from "@/app/api/puzzle-prefs/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";
import { PUZZLE_CATEGORIES } from "@/lib/puzzleCategories";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    userPuzzlePrefs: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const defaultPrefs = {
  ratingMin: 800,
  ratingMax: 1600,
  enabledCategories: [...PUZZLE_CATEGORIES],
};

function patchReq(body: unknown) {
  return new NextRequest("http://localhost/api/puzzle-prefs", {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("GET /api/puzzle-prefs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "u1" } } as any);
    (mockPrisma.userPuzzlePrefs.upsert as jest.Mock).mockResolvedValue(
      defaultPrefs,
    );
  });

  it("returns 401 when no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns existing prefs (lazily provisioned via upsert)", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ratingMin: 800,
      ratingMax: 1600,
      enabledCategories: [...PUZZLE_CATEGORIES],
    });
    expect(mockPrisma.userPuzzlePrefs.upsert).toHaveBeenCalledWith({
      where: { userId: "u1" },
      update: {},
      create: { userId: "u1" },
    });
  });

  it("returns 500 when the upsert throws", async () => {
    (mockPrisma.userPuzzlePrefs.upsert as jest.Mock).mockRejectedValue(
      new Error("db"),
    );
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

describe("PATCH /api/puzzle-prefs", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.mockResolvedValue({ user: { id: "u1" } } as any);
    (mockPrisma.userPuzzlePrefs.upsert as jest.Mock).mockResolvedValue(
      defaultPrefs,
    );
    (mockPrisma.userPuzzlePrefs.update as jest.Mock).mockImplementation(
      ({ data }: { data: any }) => Promise.resolve({ ...defaultPrefs, ...data }),
    );
  });

  it("returns 401 when no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await PATCH(patchReq({ ratingMin: 1000 }));
    expect(res.status).toBe(401);
  });

  it("clamps rating bounds to [400, 3000]", async () => {
    const res = await PATCH(
      patchReq({ ratingMin: -100, ratingMax: 10000 }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.userPuzzlePrefs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { ratingMin: 400, ratingMax: 3000 },
      }),
    );
  });

  it("rejects ratingMin > ratingMax with 400", async () => {
    const res = await PATCH(
      patchReq({ ratingMin: 2000, ratingMax: 1500 }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "ratingMin must be <= ratingMax",
    });
  });

  it("strips unknown categories from enabledCategories", async () => {
    const oneValid = PUZZLE_CATEGORIES[0];
    const res = await PATCH(
      patchReq({ enabledCategories: [oneValid, "bogus", "also-bogus"] }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.userPuzzlePrefs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { enabledCategories: [oneValid] },
      }),
    );
  });

  it("rejects an empty enabledCategories array with 400", async () => {
    const res = await PATCH(
      patchReq({ enabledCategories: ["all-bogus"] }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "At least one category must be enabled",
    });
  });

  it("returns 500 when the update throws", async () => {
    (mockPrisma.userPuzzlePrefs.update as jest.Mock).mockRejectedValue(
      new Error("db"),
    );
    const res = await PATCH(patchReq({ ratingMin: 1000 }));
    expect(res.status).toBe(500);
  });
});
