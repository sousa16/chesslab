import { POST } from "@/app/api/repertoire-entries/save-line/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth/next";
import {
  saveRepertoireLine,
  convertSanToUci,
  ensureUserRepertoires,
} from "@/lib/repertoire";

jest.mock("next-auth/next", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  authOptions: {},
}));

jest.mock("@/lib/repertoire", () => ({
  saveRepertoireLine: jest.fn(),
  convertSanToUci: jest.fn(),
  ensureUserRepertoires: jest.fn(),
}));

jest.mock("@/lib/repertoireLeaves", () => ({
  recomputeRepertoireLeaves: jest.fn(),
}));

jest.mock("next/server", () => {
  const actual = jest.requireActual("next/server");
  return {
    ...actual,
    after: jest.fn((fn: () => void) => fn()),
  };
});

const mockGetServerSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockSave = saveRepertoireLine as jest.MockedFunction<
  typeof saveRepertoireLine
>;
const mockConvert = convertSanToUci as jest.MockedFunction<typeof convertSanToUci>;
const mockEnsure = ensureUserRepertoires as jest.MockedFunction<
  typeof ensureUserRepertoires
>;

function postSave(body: object) {
  return POST(
    new NextRequest("http://localhost/api/repertoire-entries/save-line", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
  );
}

describe("POST /api/repertoire-entries/save-line", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsure.mockResolvedValue({ created: 0, hasWhite: true, hasBlack: true });
    mockConvert.mockReturnValue(["e2e4", "c7c5", "g1f3"]);
    mockSave.mockResolvedValue({
      entriesCreated: 2,
      repertoireId: "rep-white",
    });
  });

  it("returns 401 when not authenticated", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await postSave({ color: "white", movesInSan: ["e4"] });
    expect(res.status).toBe(401);
  });

  it("returns 400 for invalid color", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    const res = await postSave({ color: "red", movesInSan: ["e4"] });
    expect(res.status).toBe(400);
  });

  it("returns 400 for empty moves", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    const res = await postSave({ color: "white", movesInSan: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 for invalid move sequence", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockConvert.mockImplementation(() => {
      throw new Error("Invalid move: Qa9");
    });
    const res = await postSave({ color: "white", movesInSan: ["Qa9"] });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Invalid move sequence/);
  });

  it("returns 201 with entriesCreated on success", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    const res = await postSave({
      color: "white",
      movesInSan: ["e4", "c5", "Nf3"],
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.entriesCreated).toBe(2);
    expect(mockEnsure).toHaveBeenCalledWith("user-1");
    expect(mockSave).toHaveBeenCalledWith(
      "user-1",
      "white",
      [],
      ["e4", "c5", "Nf3"],
      ["e2e4", "c7c5", "g1f3"],
    );
  });

  it("returns 404 when repertoire is missing", async () => {
    mockGetServerSession.mockResolvedValue({ user: { id: "user-1" } });
    mockSave.mockRejectedValue(
      new Error("Repertoire not found for user user-1 and color white"),
    );
    const res = await postSave({ color: "white", movesInSan: ["e4"] });
    expect(res.status).toBe(404);
  });
});
