import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

// Mock prisma
jest.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

// Mock bcryptjs
jest.mock("bcryptjs");

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

// Simulate the authorize logic from the credentials provider
async function authorizeCredentials(credentials: any) {
  if (!credentials?.email || !credentials?.password) {
    throw new Error("Please enter your email and password");
  }

  const { email, password, action } = credentials;

  if (action === "register") {
    // Check if user already exists
    const existingUser = await mockPrisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new Error("User already exists");
    }

    // Hash password
    const hashedPassword = await mockBcrypt.hash(password, 12);

    // Create new user
    const user = await mockPrisma.user.create({
      data: {
        email,
        hashedPassword,
      },
    });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    };
  } else {
    // Login
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

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    };
  }
}

describe("Credentials Provider - Registration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Missing credentials", () => {
    it("should throw error when email is missing", async () => {
      await expect(
        authorizeCredentials({
          password: "password123",
          action: "register",
        })
      ).rejects.toThrow("Please enter your email and password");
    });

    it("should throw error when password is missing", async () => {
      await expect(
        authorizeCredentials({
          email: "test@example.com",
          action: "register",
        })
      ).rejects.toThrow("Please enter your email and password");
    });

    it("should throw error when both email and password are missing", async () => {
      await expect(
        authorizeCredentials({
          action: "register",
        })
      ).rejects.toThrow("Please enter your email and password");
    });
  });

  describe("Register new user", () => {
    it("should successfully register a new user", async () => {
      const email = "newuser@example.com";
      const password = "SecurePassword123";
      const hashedPassword = "$2a$12$hashedpassword";

      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockBcrypt.hash.mockResolvedValue(hashedPassword as never);
      mockPrisma.user.create.mockResolvedValue({
        id: "user-123",
        email,
        hashedPassword,
        name: null,
        image: null,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await authorizeCredentials({
        email,
        password,
        action: "register",
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(mockBcrypt.hash).toHaveBeenCalledWith(password, 12);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: { email, hashedPassword },
      });
      expect(result).toEqual({
        id: "user-123",
        email,
        name: null,
        image: null,
      });
    });

    it("should throw error if user already exists", async () => {
      const email = "existing@example.com";
      const password = "SecurePassword123";

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-456",
        email,
        hashedPassword: "$2a$12$hash",
        name: null,
        image: null,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        authorizeCredentials({
          email,
          password,
          action: "register",
        })
      ).rejects.toThrow("User already exists");

      expect(mockBcrypt.hash).not.toHaveBeenCalled();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });
  });
});

describe("Credentials Provider - Login", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Invalid credentials", () => {
    it("should throw error when user does not exist", async () => {
      const email = "nonexistent@example.com";
      const password = "password123";

      mockPrisma.user.findUnique.mockResolvedValue(null);

      await expect(
        authorizeCredentials({
          email,
          password,
          action: "login",
        })
      ).rejects.toThrow("Invalid email or password");
    });

    it("should throw error when user has no password (OAuth only)", async () => {
      const email = "oauth@example.com";
      const password = "password123";

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-789",
        email,
        hashedPassword: null,
        name: "Google User",
        image: "https://example.com/image.jpg",
        emailVerified: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        authorizeCredentials({
          email,
          password,
          action: "login",
        })
      ).rejects.toThrow("Invalid email or password");

      expect(mockBcrypt.compare).not.toHaveBeenCalled();
    });

    it("should throw error when password is incorrect", async () => {
      const email = "user@example.com";
      const password = "wrongpassword";
      const hashedPassword = "$2a$12$correcthash";

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-101",
        email,
        hashedPassword,
        name: null,
        image: null,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockBcrypt.compare.mockResolvedValue(false as never);

      await expect(
        authorizeCredentials({
          email,
          password,
          action: "login",
        })
      ).rejects.toThrow("Invalid email or password");

      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
    });
  });

  describe("Successful login", () => {
    it("should successfully login with correct credentials", async () => {
      const email = "user@example.com";
      const password = "CorrectPassword123";
      const hashedPassword = "$2a$12$hashedpassword";

      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-202",
        email,
        hashedPassword,
        name: "John Doe",
        image: null,
        emailVerified: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockBcrypt.compare.mockResolvedValue(true as never);

      const result = await authorizeCredentials({
        email,
        password,
        action: "login",
      });

      expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(mockBcrypt.compare).toHaveBeenCalledWith(password, hashedPassword);
      expect(result).toEqual({
        id: "user-202",
        email,
        name: "John Doe",
        image: null,
      });
    });
  });
});
