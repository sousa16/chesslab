/**
 * Training Stats API Tests — /api/training-stats
 */

import { GET } from "@/app/api/training-stats/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import {
  getTrainingStats,
  getTrainingStatsLastChanged,
} from "@/lib/trainingStats";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/trainingStats", () => ({
  getTrainingStats: jest.fn(),
  getTrainingStatsLastChanged: jest.fn(),
}));

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockGetTrainingStats = getTrainingStats as jest.MockedFunction<
  typeof getTrainingStats
>;
const mockGetTrainingStatsLastChanged =
  getTrainingStatsLastChanged as jest.MockedFunction<
    typeof getTrainingStatsLastChanged
  >;

const sampleStats = {
  dueCount: 3,
  colorStats: {
    white: { mastered: 2, total: 5 },
    black: { mastered: 1, total: 4 },
  },
  streak: 4,
  accuracy: 80,
  timeSpentMinutes: 12,
  positionsReviewedToday: 6,
};

function requestWithEtag(etag?: string) {
  const headers = etag ? { "if-none-match": etag } : undefined;
  return new NextRequest("http://localhost:3000/api/training-stats", {
    headers,
  });
}

describe("GET /api/training-stats", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetTrainingStatsLastChanged.mockResolvedValue(1_700_000_000_000);
    mockGetTrainingStats.mockResolvedValue(sampleStats);
  });

  it("returns 401 when user is not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);

    const response = await GET(requestWithEtag());
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
    expect(mockGetTrainingStats).not.toHaveBeenCalled();
  });

  it("returns stats with etag and cache headers", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", email: "test@example.com" },
    });

    const response = await GET(requestWithEtag());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(sampleStats);
    expect(data.colorStats.white).toEqual({ mastered: 2, total: 5 });
    expect(mockGetTrainingStats).toHaveBeenCalledWith("user-1");
    expect(response.headers.get("etag")).toMatch(/^W\/"/);
    expect(response.headers.get("Cache-Control")).toContain("must-revalidate");
  });

  it("returns 304 when If-None-Match matches computed etag", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1" },
    });
    const timeBucket = Math.floor(Date.now() / (5 * 60 * 1000));
    const etag = `W/"1700000000000-${timeBucket}"`;

    const response = await GET(requestWithEtag(etag));

    expect(response.status).toBe(304);
    expect(mockGetTrainingStats).not.toHaveBeenCalled();
  });

  it("returns 200 when etag does not match", async () => {
    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1" },
    });

    const response = await GET(requestWithEtag('W/"stale"'));
    expect(response.status).toBe(200);
    expect(mockGetTrainingStats).toHaveBeenCalled();
  });
});
