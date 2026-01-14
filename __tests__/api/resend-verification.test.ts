import { POST } from "@/app/api/resend-verification/route";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVerificationEmail } from "@/lib/email";

// Mock prisma
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    verificationToken: {
      deleteMany: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock email service
jest.mock("@/lib/email", () => ({
  sendVerificationEmail: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockSendEmail = sendVerificationEmail as jest.MockedFunction<
  typeof sendVerificationEmail
>;

describe("Resend Verification API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("POST /api/resend-verification", () => {
    it("should return error when email is missing", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("Email is required");
    });

    it("should return generic message when user does not exist", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({ email: "nonexistent@example.com" }),
        }
      );

      mockPrisma.user.findUnique.mockResolvedValue(null);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.message).toContain("If an account exists");
    });

    it("should return error when email is already verified", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({ email: "verified@example.com" }),
        }
      );

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email: "verified@example.com",
        emailVerified: new Date(),
        hashedPassword: "hash",
        name: null,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe("This email is already verified");
    });

    it("should delete old tokens and create new one", async () => {
      const email = "unverified@example.com";
      const request = new NextRequest(
        "http://localhost:3000/api/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        }
      );

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email,
        emailVerified: null,
        hashedPassword: "hash",
        name: null,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.verificationToken.create.mockResolvedValue({
        identifier: email,
        token: "new-token",
        expires: new Date(),
      });

      mockSendEmail.mockResolvedValue({ success: true });

      const response = await POST(request);

      expect(mockPrisma.verificationToken.deleteMany).toHaveBeenCalledWith({
        where: { identifier: email },
      });
      expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith({
        data: {
          identifier: email,
          token: expect.any(String),
          expires: expect.any(Date),
        },
      });
    });

    it("should send verification email successfully", async () => {
      const email = "unverified@example.com";
      const request = new NextRequest(
        "http://localhost:3000/api/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        }
      );

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email,
        emailVerified: null,
        hashedPassword: "hash",
        name: null,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.verificationToken.create.mockResolvedValue({
        identifier: email,
        token: "new-token",
        expires: new Date(),
      });

      mockSendEmail.mockResolvedValue({ success: true });

      const response = await POST(request);
      const data = await response.json();

      expect(mockSendEmail).toHaveBeenCalledWith(email, expect.any(String));
      expect(response.status).toBe(200);
      expect(data.message).toBe("Verification email sent successfully");
    });

    it("should return error when email sending fails", async () => {
      const email = "unverified@example.com";
      const request = new NextRequest(
        "http://localhost:3000/api/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({ email }),
        }
      );

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-123",
        email,
        emailVerified: null,
        hashedPassword: "hash",
        name: null,
        image: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockPrisma.verificationToken.create.mockResolvedValue({
        identifier: email,
        token: "new-token",
        expires: new Date(),
      });

      mockSendEmail.mockResolvedValue({
        success: false,
        error: new Error("Send failed"),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to send email");
    });

    it("should handle unexpected errors", async () => {
      const request = new NextRequest(
        "http://localhost:3000/api/resend-verification",
        {
          method: "POST",
          body: JSON.stringify({ email: "test@example.com" }),
        }
      );

      mockPrisma.user.findUnique.mockRejectedValue(new Error("Database error"));

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe("Failed to resend verification email");
    });
  });
});
