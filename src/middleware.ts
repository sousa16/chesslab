import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return request.headers.get("x-real-ip") ?? "unknown";
}

const SENSITIVE_PATHS = [
  "/api/request-password-reset",
  "/api/resend-verification",
  "/api/reset-password",
  "/api/verify-email",
];

const WRITE_PATHS = [
  "/api/repertoire-entries/save-line",
  "/api/repertoire-entries/review",
  "/api/repertoire-entries/family",
  "/api/puzzles/review",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Cron uses a shared secret — skip IP limits (route validates the secret).
  if (pathname.startsWith("/api/cron/")) {
    return NextResponse.next();
  }

  const ip = clientIp(request);

  if (SENSITIVE_PATHS.some((p) => pathname.startsWith(p))) {
    const result = checkRateLimit(`sensitive:${ip}`, {
      max: 8,
      windowMs: 60 * 60 * 1000,
    });
    if (!result.ok) return rateLimitResponse(result.retryAfterSeconds);
  }

  if (WRITE_PATHS.some((p) => pathname.startsWith(p))) {
    const result = checkRateLimit(`write:${ip}`, {
      max: 60,
      windowMs: 60 * 1000,
    });
    if (!result.ok) return rateLimitResponse(result.retryAfterSeconds);
  }

  const result = checkRateLimit(`api:${ip}`, {
    max: 200,
    windowMs: 60 * 1000,
  });
  if (!result.ok) return rateLimitResponse(result.retryAfterSeconds);

  return NextResponse.next();
}

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

export const config = {
  matcher: "/api/:path*",
};
