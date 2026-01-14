import { middleware } from "@/middleware";
import { getToken } from "next-auth/jwt";
import { NextRequest } from "next/server";

// Mock next-auth/jwt
jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn(),
}));

const mockGetToken = getToken as jest.MockedFunction<typeof getToken>;

describe("Middleware - Route Protection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Protected Routes (No Token)", () => {
    it("should redirect from / to /auth when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/");

      const response = await middleware(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/auth");
    });

    it("should redirect from /repertoire to /auth when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/repertoire");

      const response = await middleware(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/auth");
    });

    it("should redirect from /training to /auth when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/training");

      const response = await middleware(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/auth");
    });
  });

  describe("Protected Routes (With Token)", () => {
    const mockToken = {
      sub: "user-123",
      email: "test@example.com",
      iat: Math.floor(Date.now() / 1000),
    };

    it("should allow access to / when authenticated", async () => {
      mockGetToken.mockResolvedValue(mockToken as any);
      const request = new NextRequest("http://localhost:3000/");

      const response = await middleware(request);

      expect(response?.status).toBe(200);
      expect(response?.headers.get("location")).toBeNull();
    });

    it("should allow access to /repertoire when authenticated", async () => {
      mockGetToken.mockResolvedValue(mockToken as any);
      const request = new NextRequest("http://localhost:3000/repertoire");

      const response = await middleware(request);

      expect(response?.status).toBe(200);
      expect(response?.headers.get("location")).toBeNull();
    });

    it("should allow access to /training when authenticated", async () => {
      mockGetToken.mockResolvedValue(mockToken as any);
      const request = new NextRequest("http://localhost:3000/training");

      const response = await middleware(request);

      expect(response?.status).toBe(200);
      expect(response?.headers.get("location")).toBeNull();
    });
  });

  describe("Public Routes (/auth)", () => {
    it("should allow access to /auth when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/auth");

      const response = await middleware(request);

      expect(response?.status).toBe(200);
      expect(response?.headers.get("location")).toBeNull();
    });

    it("should redirect from /auth to / when authenticated", async () => {
      mockGetToken.mockResolvedValue({
        sub: "user-123",
        email: "test@example.com",
      } as any);
      const request = new NextRequest("http://localhost:3000/auth");

      const response = await middleware(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/");
    });
  });

  describe("API Routes", () => {
    it("should allow access to /api routes without authentication check", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/api/verify-email");

      const response = await middleware(request);

      expect(response?.status).toBe(200);
      expect(response?.headers.get("location")).toBeNull();
    });
  });

  describe("Static Files", () => {
    it("should skip middleware for _next/static", async () => {
      const request = new NextRequest(
        "http://localhost:3000/_next/static/chunks/main.js"
      );

      // This should not call getToken due to matcher config
      const response = await middleware(request);

      // Should return without processing
      expect(response?.status).toBe(200);
    });
  });
});
