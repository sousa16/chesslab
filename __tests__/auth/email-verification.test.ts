import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { sendVerificationEmail } from "@/lib/email";
import { randomBytes } from "crypto";

// Mock dependencies
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    verificationToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("bcryptjs");
jest.mock("@/lib/email");
jest.mock("crypto");

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;
const mockSendEmail = sendVerificationEmail as jest.MockedFunction<
  typeof sendVerificationEmail
>;
const mockRandomBytes = randomBytes as jest.MockedFunction<typeof randomBytes>;

// Simulate registration with email verification
async function registerWithVerification(email: string, password: string) {
  const existingUser = await mockPrisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    throw new Error("User already exists");
  }

  const hashedPassword = await mockBcrypt.hash(password, 12);

  const user = await mockPrisma.user.create({
    data: {
      email,
      hashedPassword,
      emailVerified: null,
    },
  });

  const token = mockRandomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await mockPrisma.verificationToken.create({
    data: {
      identifier: email,
      token,
      expires,
    },
  });

  await mockSendEmail(email, token);

  throw new Error(
    "Please check your email to verify your account before signing in"
  );
}

// Simulate login with email verification check
async function loginWithVerificationCheck(email: string, password: string) {
  const user = await mockPrisma.user.findUnique({
    where: { email },
  });

  if (!user || !user.hashedPassword) {
    throw new Error("Invalid email or password");
  }

  const isPasswordValid = await mockBcrypt.compare(
    password,
    user.hashedPassword
  );

  if (!isPasswordValid) {
    throw new Error("Invalid email or password");
  }

  if (!user.emailVerified) {
    // Auto-send verification email
    await mockPrisma.verificationToken.deleteMany({
      where: {
        identifier: email,
        expires: { lt: new Date() },
      },
    });

    const existingToken = await mockPrisma.verificationToken.findFirst({
      where: {
        identifier: email,
        expires: { gt: new Date() },
      },
    });

    let token: string;

    if (existingToken) {
      token = existingToken.token;
    } else {
      token = mockRandomBytes(32).toString("hex");
      const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);

      await mockPrisma.verificationToken.create({
        data: {
          identifier: email,
          token,
          expires,
        },
      });
    }

    await mockSendEmail(email, token);

    throw new Error(
      "Please verify your email before signing in. A new verification email has been sent."
    );
  }

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
  };
}

describe("Email Verification - Registration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomBytes.mockReturnValue(Buffer.from("mock-token"));
  });

  it("should create user with emailVerified as null", async () => {
    const email = "newuser@example.com";
    const password = "password123";

    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed" as never);
    mockPrisma.user.create.mockResolvedValue({
      id: "user-123",
      email,
      hashedPassword: "hashed",
      emailVerified: null,
      name: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSendEmail.mockResolvedValue({ success: true });

    await expect(registerWithVerification(email, password)).rejects.toThrow(
      "Please check your email"
    );

    expect(mockPrisma.user.create).toHaveBeenCalledWith({
      data: {
        email,
        hashedPassword: "hashed",
        emailVerified: null,
      },
    });
  });

  it("should create verification token on registration", async () => {
    const email = "newuser@example.com";
    const password = "password123";

    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed" as never);
    mockPrisma.user.create.mockResolvedValue({
      id: "user-123",
      email,
      hashedPassword: "hashed",
      emailVerified: null,
      name: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSendEmail.mockResolvedValue({ success: true });

    await expect(registerWithVerification(email, password)).rejects.toThrow();

    expect(mockPrisma.verificationToken.create).toHaveBeenCalledWith({
      data: {
        identifier: email,
        token: expect.any(String),
        expires: expect.any(Date),
      },
    });
  });

  it("should send verification email on registration", async () => {
    const email = "newuser@example.com";
    const password = "password123";

    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockBcrypt.hash.mockResolvedValue("hashed" as never);
    mockPrisma.user.create.mockResolvedValue({
      id: "user-123",
      email,
      hashedPassword: "hashed",
      emailVerified: null,
      name: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockSendEmail.mockResolvedValue({ success: true });

    await expect(registerWithVerification(email, password)).rejects.toThrow();

    expect(mockSendEmail).toHaveBeenCalledWith(email, expect.any(String));
  });
});

describe("Email Verification - Login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRandomBytes.mockReturnValue(Buffer.from("mock-token"));
  });

  it("should reject login when email is not verified", async () => {
    const email = "unverified@example.com";
    const password = "password123";

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-123",
      email,
      hashedPassword: "hashed",
      emailVerified: null,
      name: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
    mockSendEmail.mockResolvedValue({ success: true });

    await expect(loginWithVerificationCheck(email, password)).rejects.toThrow(
      "Please verify your email"
    );
  });

  it("should send verification email when unverified user tries to login", async () => {
    const email = "unverified@example.com";
    const password = "password123";

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-123",
      email,
      hashedPassword: "hashed",
      emailVerified: null,
      name: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
    mockSendEmail.mockResolvedValue({ success: true });

    await expect(loginWithVerificationCheck(email, password)).rejects.toThrow();

    expect(mockSendEmail).toHaveBeenCalledWith(email, expect.any(String));
  });

  it("should reuse existing valid token when user tries to login", async () => {
    const email = "unverified@example.com";
    const password = "password123";
    const existingToken = "existing-token-123";

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-123",
      email,
      hashedPassword: "hashed",
      emailVerified: null,
      name: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockPrisma.verificationToken.findFirst.mockResolvedValue({
      identifier: email,
      token: existingToken,
      expires: new Date(Date.now() + 1000),
    });
    mockSendEmail.mockResolvedValue({ success: true });

    await expect(loginWithVerificationCheck(email, password)).rejects.toThrow();

    expect(mockSendEmail).toHaveBeenCalledWith(email, existingToken);
    expect(mockPrisma.verificationToken.create).not.toHaveBeenCalled();
  });

  it("should allow login when email is verified", async () => {
    const email = "verified@example.com";
    const password = "password123";

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-123",
      email,
      hashedPassword: "hashed",
      emailVerified: new Date(),
      name: "Test User",
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockBcrypt.compare.mockResolvedValue(true as never);

    const result = await loginWithVerificationCheck(email, password);

    expect(result).toEqual({
      id: "user-123",
      email,
      name: "Test User",
      image: null,
    });
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("should delete expired tokens before checking for valid tokens", async () => {
    const email = "unverified@example.com";
    const password = "password123";

    mockPrisma.user.findUnique.mockResolvedValue({
      id: "user-123",
      email,
      hashedPassword: "hashed",
      emailVerified: null,
      name: null,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mockBcrypt.compare.mockResolvedValue(true as never);
    mockPrisma.verificationToken.findFirst.mockResolvedValue(null);
    mockSendEmail.mockResolvedValue({ success: true });

    await expect(loginWithVerificationCheck(email, password)).rejects.toThrow();

    expect(mockPrisma.verificationToken.deleteMany).toHaveBeenCalledWith({
      where: {
        identifier: email,
        expires: { lt: expect.any(Date) },
      },
    });
  });
});
