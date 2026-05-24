import { POST } from "@/app/api/repertoire-entries/review/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import { prisma } from "@/lib/prisma";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    repertoireEntry: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    dailyActivity: {
      upsert: jest.fn(),
    },
  },
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

function postReview(body: object) {
  return POST(
    new NextRequest("http://localhost/api/repertoire-entries/review", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

const baseEntry = {
  interval: 0,
  easeFactor: 2.5,
  repetitions: 0,
  nextReviewDate: new Date(),
  phase: "learning",
  learningStepIndex: 0,
  lastReviewDate: null,
  repertoire: { userId: "user-1" },
};

describe("POST /api/repertoire-entries/review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.repertoireEntry.update.mockResolvedValue({ id: "entry-1" } as any);
    mockPrisma.dailyActivity.upsert.mockResolvedValue({} as any);
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await postReview({ entryId: "e1", response: "effort" });
    expect(res.status).toBe(401);
  });

  it("returns 400 when entryId or response is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    const res = await postReview({ entryId: "e1" });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid response", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    const res = await postReview({ entryId: "e1", response: "invalid" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when entry not found", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.repertoireEntry.findUnique.mockResolvedValue(null);
    const res = await postReview({ entryId: "missing", response: "easy" });
    expect(res.status).toBe(404);
  });

  it("returns 403 when entry belongs to another user", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.repertoireEntry.findUnique.mockResolvedValue({
      ...baseEntry,
      repertoire: { userId: "other-user" },
    } as any);
    const res = await postReview({ entryId: "e1", response: "easy" });
    expect(res.status).toBe(403);
  });

  it("updates entry and daily activity on success", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockPrisma.repertoireEntry.findUnique.mockResolvedValue({
      ...baseEntry,
      id: "entry-1",
    } as any);

    const res = await postReview({
      entryId: "entry-1",
      response: "effort",
      timeSpentMs: 5000,
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.result).toBeDefined();
    expect(mockPrisma.repertoireEntry.update).toHaveBeenCalled();
    expect(mockPrisma.dailyActivity.upsert).toHaveBeenCalled();
  });
});
