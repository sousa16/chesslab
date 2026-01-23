import { proxy } from "@/proxy";
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

  describe("Public Routes", () => {
    it("should allow access to / (landing page) when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });

    it("should allow access to / (landing page) when authenticated", async () => {
      mockGetToken.mockResolvedValue({
        sub: "user-123",
        email: "test@example.com",
      } as unknown as Awaited<ReturnType<typeof getToken>>);
      const request = new NextRequest("http://localhost:3000/");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });

    it("should allow access to /auth when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/auth");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });
  });

  describe("Protected Routes (No Token)", () => {
    it("should redirect from /home to / when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/home");

      const response = await proxy(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/");
      expect(response?.headers.get("location")).not.toContain("/home");
    });

    it("should redirect from /repertoire to / when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/repertoire");

      const response = await proxy(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/");
      expect(response?.headers.get("location")).not.toContain("/repertoire");
    });

    it("should redirect from /training to / when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/training");

      const response = await proxy(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/");
      expect(response?.headers.get("location")).not.toContain("/training");
    });

    it("should redirect from /build/white to / when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/build/white");

      const response = await proxy(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/");
    });

    it("should redirect from /settings to / when not authenticated", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/settings");

      const response = await proxy(request);

      expect(response?.status).toBe(307);
      expect(response?.headers.get("location")).toContain("/");
    });
  });

  describe("Protected Routes (With Token)", () => {
    const mockToken = {
      sub: "user-123",
      email: "test@example.com",
      iat: Math.floor(Date.now() / 1000),
    };

    it("should allow access to /home when authenticated", async () => {
      mockGetToken.mockResolvedValue(mockToken as unknown as Awaited<ReturnType<typeof getToken>>);
      const request = new NextRequest("http://localhost:3000/home");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });

    it("should allow access to /repertoire when authenticated", async () => {
      mockGetToken.mockResolvedValue(mockToken as unknown as Awaited<ReturnType<typeof getToken>>);
      const request = new NextRequest("http://localhost:3000/repertoire");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });

    it("should allow access to /training when authenticated", async () => {
      mockGetToken.mockResolvedValue(mockToken as unknown as Awaited<ReturnType<typeof getToken>>);
      const request = new NextRequest("http://localhost:3000/training");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });

    it("should allow access to /build/white when authenticated", async () => {
      mockGetToken.mockResolvedValue(mockToken as unknown as Awaited<ReturnType<typeof getToken>>);
      const request = new NextRequest("http://localhost:3000/build/white");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });

    it("should allow access to /settings when authenticated", async () => {
      mockGetToken.mockResolvedValue(mockToken as unknown as Awaited<ReturnType<typeof getToken>>);
      const request = new NextRequest("http://localhost:3000/settings");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });
  });

  describe("API Routes", () => {
    it("should allow access to /api routes without authentication check", async () => {
      mockGetToken.mockResolvedValue(null);
      const request = new NextRequest("http://localhost:3000/api/verify-email");

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });
  });

  describe("Static Files", () => {
    it("should skip middleware for _next/static", async () => {
      const request = new NextRequest(
        "http://localhost:3000/_next/static/chunks/main.js"
      );

      const response = await proxy(request);

      expect(response?.status).toBe(200);
    });
  });
});
