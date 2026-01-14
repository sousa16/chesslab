import { sendVerificationEmail } from "@/lib/email";
import { Resend } from "resend";

// Mock Resend
jest.mock("resend");

const mockResend = Resend as jest.MockedClass<typeof Resend>;

describe("Email Service", () => {
  let mockSend: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSend = jest.fn();
    mockResend.prototype.emails = {
      send: mockSend,
    } as any;
  });

  describe("sendVerificationEmail", () => {
    const testEmail = "test@example.com";
    const testToken = "test-token-123";

    it("should send verification email successfully", async () => {
      mockSend.mockResolvedValue({ id: "email-id-123" });

      const result = await sendVerificationEmail(testEmail, testToken);

      expect(mockSend).toHaveBeenCalledWith({
        from: process.env.FROM_EMAIL,
        to: testEmail,
        subject: "Verify your Chesslab account",
        html: expect.stringContaining("Welcome to Chesslab"),
      });
      expect(result.success).toBe(true);
    });

    it("should include verification URL in email", async () => {
      mockSend.mockResolvedValue({ id: "email-id-123" });

      await sendVerificationEmail(testEmail, testToken);

      const callArgs = mockSend.mock.calls[0][0];
      const expectedUrl = `${process.env.NEXTAUTH_URL}/api/verify-email?token=${testToken}`;

      expect(callArgs.html).toContain(expectedUrl);
    });

    it("should handle email send failure", async () => {
      const error = new Error("Email service error");
      mockSend.mockRejectedValue(error);

      const result = await sendVerificationEmail(testEmail, testToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe(error);
    });

    it("should include expiration notice in email", async () => {
      mockSend.mockResolvedValue({ id: "email-id-123" });

      await sendVerificationEmail(testEmail, testToken);

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.html).toContain("24 hours");
    });

    it("should use correct sender email", async () => {
      mockSend.mockResolvedValue({ id: "email-id-123" });

      await sendVerificationEmail(testEmail, testToken);

      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({
          from: process.env.FROM_EMAIL,
        })
      );
    });
  });
});
