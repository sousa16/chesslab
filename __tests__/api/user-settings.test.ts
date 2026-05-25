/**
 * Tests for the user-account endpoints: update-settings (PATCH),
 * update-profile (PATCH), change-password (POST), delete-account (DELETE).
 *
 * Each handler is small (auth → validate → prisma write), so a tight
 * coverage of 401/400 paths and one happy-path per route is enough.
 */
import { PATCH as updateSettings } from "@/app/api/user/update-settings/route";
import { PATCH as updateProfile } from "@/app/api/user/update-profile/route";
import { POST as changePassword } from "@/app/api/user/change-password/route";
import { DELETE as deleteAccount } from "@/app/api/user/delete-account/route";
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({ authOptions: {} }));

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    compare: jest.fn(),
    hash: jest.fn(),
  },
}));

const mockSession = getServerSession as jest.MockedFunction<
  typeof getServerSession
>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockBcrypt = bcrypt as unknown as {
  compare: jest.Mock;
  hash: jest.Mock;
};

function jsonReq(url: string, body: unknown, method = "POST") {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSession.mockResolvedValue({
    user: { email: "alice@example.com" },
  } as any);
});

describe("PATCH /api/user/update-settings", () => {
  it("returns 401 with no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await updateSettings(
      jsonReq("http://x/api/user/update-settings", { dailyReminder: true }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when dailyReminder isn't a boolean", async () => {
    const res = await updateSettings(
      jsonReq("http://x/api/user/update-settings", { dailyReminder: "yes" }),
    );
    expect(res.status).toBe(400);
  });

  it("writes dailyReminder to the user on success", async () => {
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    const res = await updateSettings(
      jsonReq("http://x/api/user/update-settings", { dailyReminder: true }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
      data: { dailyReminder: true },
    });
  });
});

describe("PATCH /api/user/update-profile", () => {
  it("returns 401 with no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await updateProfile(
      jsonReq("http://x/api/user/update-profile", { name: "Alice" }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when name isn't a string", async () => {
    const res = await updateProfile(
      jsonReq("http://x/api/user/update-profile", { name: 5 }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the trimmed name is empty", async () => {
    const res = await updateProfile(
      jsonReq("http://x/api/user/update-profile", { name: "   " }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Name cannot be empty" });
  });

  it("returns 400 when the name exceeds 100 chars", async () => {
    const res = await updateProfile(
      jsonReq("http://x/api/user/update-profile", { name: "a".repeat(101) }),
    );
    expect(res.status).toBe(400);
  });

  it("trims and persists the new name", async () => {
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({
      name: "Alice",
    });
    const res = await updateProfile(
      jsonReq("http://x/api/user/update-profile", { name: "  Alice  " }),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
      data: { name: "Alice" },
    });
    expect(await res.json()).toEqual({ success: true, name: "Alice" });
  });
});

describe("POST /api/user/change-password", () => {
  it("returns 401 with no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await changePassword(
      jsonReq("http://x/api/user/change-password", {
        currentPassword: "x",
        newPassword: "y",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 400 when either password is missing", async () => {
    const res = await changePassword(
      jsonReq("http://x/api/user/change-password", {
        currentPassword: "abc",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when the new password is too short", async () => {
    const res = await changePassword(
      jsonReq("http://x/api/user/change-password", {
        currentPassword: "abc",
        newPassword: "short",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 for an OAuth-only account (no hashed password)", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      hashedPassword: null,
    });
    const res = await changePassword(
      jsonReq("http://x/api/user/change-password", {
        currentPassword: "abc12345",
        newPassword: "newlongenoughpw",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Cannot change password for OAuth accounts",
    });
  });

  it("returns 400 when the current password doesn't match", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      hashedPassword: "stored-hash",
    });
    mockBcrypt.compare.mockResolvedValue(false);
    const res = await changePassword(
      jsonReq("http://x/api/user/change-password", {
        currentPassword: "wrong",
        newPassword: "newlongenoughpw",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Current password is incorrect",
    });
  });

  it("hashes and stores the new password on success", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      hashedPassword: "stored-hash",
    });
    mockBcrypt.compare.mockResolvedValue(true);
    mockBcrypt.hash.mockResolvedValue("new-hash");
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
    const res = await changePassword(
      jsonReq("http://x/api/user/change-password", {
        currentPassword: "rightpw1",
        newPassword: "newlongenoughpw",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockBcrypt.hash).toHaveBeenCalledWith("newlongenoughpw", 12);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
      data: { hashedPassword: "new-hash" },
    });
  });
});

describe("DELETE /api/user/delete-account", () => {
  it("returns 401 with no session", async () => {
    mockSession.mockResolvedValue(null);
    const res = await deleteAccount(
      jsonReq("http://x/api/user/delete-account", {}, "DELETE"),
    );
    expect(res.status).toBe(401);
  });

  it("deletes the user by email on success", async () => {
    (mockPrisma.user.delete as jest.Mock).mockResolvedValue({});
    const res = await deleteAccount(
      jsonReq("http://x/api/user/delete-account", {}, "DELETE"),
    );
    expect(res.status).toBe(200);
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
    });
  });

  it("returns 500 when the delete throws", async () => {
    (mockPrisma.user.delete as jest.Mock).mockRejectedValue(new Error("db"));
    const res = await deleteAccount(
      jsonReq("http://x/api/user/delete-account", {}, "DELETE"),
    );
    expect(res.status).toBe(500);
  });
});
