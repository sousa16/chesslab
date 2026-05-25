/**
 * Tests for the password-reset request and apply endpoints.
 *
 * Both endpoints share the verificationToken table; the request endpoint
 * always returns a generic "if an account exists" response to avoid
 * email enumeration.
 */
import { POST as requestReset } from "@/app/api/request-password-reset/route";
import { POST as resetPassword } from "@/app/api/reset-password/route";
import { prisma } from "@/lib/prisma";
import { sendPasswordResetEmail } from "@/lib/email";
import bcrypt from "bcryptjs";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    verificationToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/email", () => ({
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: { hash: jest.fn() },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockSendEmail = sendPasswordResetEmail as jest.MockedFunction<
  typeof sendPasswordResetEmail
>;
const mockBcrypt = bcrypt as unknown as { hash: jest.Mock };

function jsonReq(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/request-password-reset", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockPrisma.verificationToken.create as jest.Mock).mockResolvedValue({});
    mockSendEmail.mockResolvedValue({} as any);
  });

  it("returns 400 when email is missing", async () => {
    const res = await requestReset(
      jsonReq("http://localhost/api/request-password-reset", {}),
    );
    expect(res.status).toBe(400);
  });

  it("returns generic success when the user doesn't exist (no enumeration)", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);
    const res = await requestReset(
      jsonReq("http://localhost/api/request-password-reset", {
        email: "ghost@example.com",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      message:
        "If an account exists with that email, you will receive a password reset link.",
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
    expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
  });

  it("creates a verification token and sends an email when the user exists", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "alice@example.com",
    });

    const res = await requestReset(
      jsonReq("http://localhost/api/request-password-reset", {
        email: "alice@example.com",
      }),
    );
    expect(res.status).toBe(200);

    expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          identifier: "password-reset:alice@example.com",
          token: expect.any(String),
          expires: expect.any(Date),
        }),
      }),
    );
    expect(mockSendEmail).toHaveBeenCalledWith(
      "alice@example.com",
      expect.any(String),
    );
  });

  it("returns 500 when the DB throws", async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockRejectedValue(
      new Error("db"),
    );
    const res = await requestReset(
      jsonReq("http://localhost/api/request-password-reset", {
        email: "alice@example.com",
      }),
    );
    expect(res.status).toBe(500);
  });
});

describe("POST /api/reset-password", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBcrypt.hash.mockResolvedValue("hashed-pw");
    (mockPrisma.verificationToken.delete as jest.Mock).mockResolvedValue({});
    (mockPrisma.user.update as jest.Mock).mockResolvedValue({});
  });

  it("returns 400 when token or password is missing", async () => {
    const res = await resetPassword(
      jsonReq("http://localhost/api/reset-password", { token: "abc" }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is too short", async () => {
    const res = await resetPassword(
      jsonReq("http://localhost/api/reset-password", {
        token: "abc",
        password: "short",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Password must be at least 8 characters",
    });
  });

  it("returns 400 for an unknown token", async () => {
    (mockPrisma.verificationToken.findUnique as jest.Mock).mockResolvedValue(
      null,
    );
    const res = await resetPassword(
      jsonReq("http://localhost/api/reset-password", {
        token: "bad",
        password: "longenough123",
      }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: "Invalid or expired reset link",
    });
  });

  it("returns 400 and deletes expired tokens", async () => {
    (mockPrisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      identifier: "password-reset:alice@example.com",
      token: "exp",
      expires: new Date(Date.now() - 60_000),
    });
    const res = await resetPassword(
      jsonReq("http://localhost/api/reset-password", {
        token: "exp",
        password: "longenough123",
      }),
    );
    expect(res.status).toBe(400);
    expect(mockPrisma.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: "exp" },
    });
  });

  it("returns 404 when the user the token references is gone", async () => {
    (mockPrisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      identifier: "password-reset:alice@example.com",
      token: "tok",
      expires: new Date(Date.now() + 60_000),
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(null);

    const res = await resetPassword(
      jsonReq("http://localhost/api/reset-password", {
        token: "tok",
        password: "longenough123",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("hashes the new password, updates the user, and deletes the token on success", async () => {
    (mockPrisma.verificationToken.findUnique as jest.Mock).mockResolvedValue({
      identifier: "password-reset:alice@example.com",
      token: "tok",
      expires: new Date(Date.now() + 60_000),
    });
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: "u1",
      email: "alice@example.com",
    });

    const res = await resetPassword(
      jsonReq("http://localhost/api/reset-password", {
        token: "tok",
        password: "longenough123",
      }),
    );
    expect(res.status).toBe(200);
    expect(mockBcrypt.hash).toHaveBeenCalledWith("longenough123", 10);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { email: "alice@example.com" },
      data: { hashedPassword: "hashed-pw" },
    });
    expect(mockPrisma.verificationToken.delete).toHaveBeenCalledWith({
      where: { token: "tok" },
    });
  });

  it("returns 500 when the DB throws", async () => {
    (mockPrisma.verificationToken.findUnique as jest.Mock).mockRejectedValue(
      new Error("db"),
    );
    const res = await resetPassword(
      jsonReq("http://localhost/api/reset-password", {
        token: "tok",
        password: "longenough123",
      }),
    );
    expect(res.status).toBe(500);
  });
});
