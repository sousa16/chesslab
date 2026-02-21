import { GET } from "@/app/api/verify-email/route";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// Mock prisma
jest.mock("@/lib/prisma", () => ({
  prisma: {
    verificationToken: {
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe("Verify Email API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GET /api/verify-email", () => {
    it("should redirect with error when token is missing", async () => {
      const request = new NextRequest("http://localhost:3000/api/verify-email");

      const response = await GET(request);

      expect(response.status).toBe(307); // Redirect status
      const location = response.headers.get("location") || "";
      expect(location).toMatch(/\/\?error=Invalid.*verification.*link/);
    });

    it("should redirect with error when token is invalid", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/verify-email?token=invalid-token",
      );

      mockPrisma.verificationToken.findUnique.mockResolvedValue(null);

      const response = await GET(request);

      expect(mockPrisma.verificationToken.findUnique).toHaveBeenCalledWith({
        where: { token: "invalid-token" },
      });
      const location = response.headers.get("location") || "";
      expect(location).toMatch(
        /\/\?error=Invalid.*expired.*verification.*link/,
      );
    });

    it("should redirect with error when token is expired", async () => {
      const expiredDate = new Date(Date.now() - 1000); // 1 second ago
      const request = new NextRequest(
        "http://localhost:3000/api/verify-email?token=expired-token",
      );

      mockPrisma.verificationToken.findUnique.mockResolvedValue({
        identifier: "test@example.com",
        token: "expired-token",
        expires: expiredDate,
      });

      const response = await GET(request);

      expect(mockPrisma.verificationToken.delete).toHaveBeenCalledWith({
        where: { token: "expired-token" },
      });
      const location = response.headers.get("location") || "";
      expect(location).toMatch(/\/\?error=Verification.*link.*expired/);
    });

    it("should verify email successfully with valid token", async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now
      const request = new NextRequest(
        "http://localhost:3000/api/verify-email?token=valid-token",
      );

      mockPrisma.verificationToken.findUnique.mockResolvedValue({
        identifier: "test@example.com",
        token: "valid-token",
        expires: futureDate,
      });

      mockPrisma.user.update.mockResolvedValue({
        id: "user-123",
        email: "test@example.com",
        emailVerified: new Date(),
        hashedPassword: "hash",
        name: null,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await GET(request);

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
        data: { emailVerified: expect.any(Date) },
      });
      expect(mockPrisma.verificationToken.delete).toHaveBeenCalledWith({
        where: { token: "valid-token" },
      });
      const location = response.headers.get("location") || "";
      expect(location).toMatch(/\/\?verified=true/);
    });

    it("should handle database errors gracefully", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/verify-email?token=test-token",
      );

      mockPrisma.verificationToken.findUnique.mockRejectedValue(
        new Error("Database error"),
      );

      const response = await GET(request);

      const location = response.headers.get("location") || "";
      expect(location).toMatch(/\/\?error=Verification.*failed/);
    });
  });
});
