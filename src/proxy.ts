import { getToken } from "next-auth/jwt";
import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rateLimit";

/**
 * Next.js 16 unified the request-pipeline file into `proxy.ts` and removed
 * `middleware.ts`. This file folds in two responsibilities that used to
 * live separately:
 *
 *   1. API rate limiting (formerly src/middleware.ts) — per-IP buckets
 *      sized differently for sensitive auth flows, write paths, and the
 *      generic API surface.
 *   2. Auth gate for the app routes — redirect signed-in users away from
 *      the landing page, and redirect signed-out users away from the
 *      protected app routes.
 *
 * The dispatch is by path prefix: every `/api/*` request goes through
 * the rate limiter and skips the auth gate; everything else goes through
 * the auth gate and skips the rate limiter.
 */

// ── API rate limiting ────────────────────────────────────────────────────

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

function rateLimitResponse(retryAfterSeconds: number) {
  return NextResponse.json(
    { error: "Too many requests. Please try again later." },
    {
      status: 429,
      headers: { "Retry-After": String(retryAfterSeconds) },
    },
  );
}

function applyApiRateLimits(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl;

  // Cron uses a shared secret — the route validates it; skip IP limits.
  if (pathname.startsWith("/api/cron/")) {
    return null;
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

  return null;
}

// ── Auth gate ────────────────────────────────────────────────────────────

const protectedRoutes = ["/home", "/repertoire", "/training", "/build"];

async function applyAuthGate(
  request: NextRequest,
): Promise<NextResponse | null> {
  const { pathname, origin } = request.nextUrl;

  // Skip internal Next paths and static files.
  if (
    pathname.startsWith("/_next") ||
    pathname.includes(".") // favicon, images, etc.
  ) {
    return null;
  }

  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route),
  );

  try {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });

    if (token && pathname === "/") {
      return NextResponse.redirect(new URL("/home", origin));
    }

    if (isProtectedRoute && !token) {
      return NextResponse.redirect(new URL("/", origin));
    }
  } catch {
    if (isProtectedRoute) {
      return NextResponse.redirect(new URL("/", origin));
    }
  }

  return null;
}

// ── Entry point ──────────────────────────────────────────────────────────

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const blocked = applyApiRateLimits(request);
    return blocked ?? NextResponse.next();
  }

  const redirect = await applyAuthGate(request);
  return redirect ?? NextResponse.next();
}

export const config = {
  // Match everything except Next internals + static assets. The function
  // itself splits `/api/*` (rate-limit) from everything else (auth gate).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
