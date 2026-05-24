import { NextRequest } from "next/server";
import { middleware } from "@/middleware";

function apiRequest(path: string, ip = "203.0.113.10") {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: { "x-forwarded-for": ip },
  });
}

describe("API rate-limit middleware", () => {
  it("allows non-API routes without rate limiting", () => {
    const res = middleware(new NextRequest("http://localhost:3000/home"));
    expect(res.status).toBe(200);
  });

  it("allows cron routes without rate limiting", () => {
    const res = middleware(
      apiRequest("/api/cron/send-daily-reminders", "203.0.113.20"),
    );
    expect(res.status).toBe(200);
  });

  it("returns 429 for sensitive routes after the limit", async () => {
    const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
    let lastStatus = 200;
    for (let i = 0; i < 9; i++) {
      const res = middleware(apiRequest("/api/request-password-reset", ip));
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
    const body = await middleware(
      apiRequest("/api/request-password-reset", ip),
    ).json();
    expect(body.error).toMatch(/too many requests/i);
  });

  it("returns 429 for write routes after the limit", async () => {
    const ip = `203.0.114.${Math.floor(Math.random() * 200) + 1}`;
    let lastStatus = 200;
    for (let i = 0; i < 61; i++) {
      const res = middleware(
        apiRequest("/api/repertoire-entries/save-line", ip),
      );
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("allows normal API traffic under the general limit", () => {
    const ip = `203.0.115.${Math.floor(Math.random() * 200) + 1}`;
    const res = middleware(apiRequest("/api/training-stats", ip));
    expect(res.status).toBe(200);
  });
});
