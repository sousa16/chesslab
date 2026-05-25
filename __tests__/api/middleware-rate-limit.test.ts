import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

// The auth-gate branch of proxy() calls next-auth's getToken. We don't
// care about it in this suite — these tests only exercise the
// /api/* rate-limit branch, so stub getToken to return null and let the
// non-API tests assert that the proxy didn't 429 (regardless of any
// auth redirect that may also happen).
jest.mock("next-auth/jwt", () => ({
  getToken: jest.fn().mockResolvedValue(null),
}));

function apiRequest(path: string, ip = "203.0.113.10") {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("API rate-limit (in proxy.ts)", () => {
  it("does not rate-limit non-API routes", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/home"));
    // /home is a protected route — the auth-gate may redirect to '/' for
    // an unauthenticated request. Either way, the rate limiter must not
    // have fired (no 429).
    expect(res.status).not.toBe(429);
  });

  it("allows cron routes without rate limiting", async () => {
    const res = await proxy(
      apiRequest("/api/cron/send-daily-reminders", "203.0.113.20"),
    );
    expect(res.status).toBe(200);
  });

  it("returns 429 for sensitive routes after the limit", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    let lastStatus = 200;
    for (let i = 0; i < 9; i++) {
      const res = await proxy(apiRequest("/api/request-password-reset", ip));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
    const body = await (
      await proxy(apiRequest("/api/request-password-reset", ip))
    ).json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it("returns 429 for write routes after the limit", async () => {
    const ip = `203.0.114.${Math.floor(Math.random() * 200) + 1}`;
    let lastStatus = 200;
    for (let i = 0; i < 61; i++) {
      const res = await proxy(
        apiRequest("/api/repertoire-entries/save-line", ip),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("allows normal API traffic under the general limit", async () => {
    const ip = `203.0.115.${Math.floor(Math.random() * 200) + 1}`;
    const res = await proxy(apiRequest("/api/training-stats", ip));
    expect(res.status).toBe(200);
  });
});
